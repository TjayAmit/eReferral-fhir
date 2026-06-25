"use client";

import { useEffect, useState } from "react";
import { fhirGet, FhirError } from "@/lib/fhir";
import { humanName } from "@/lib/referral";

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  requested: { color: "#3b82f6", bg: "#eff6ff", label: "Requested" },
  received:  { color: "#f59e0b", bg: "#fffbeb", label: "Received" },
  accepted:  { color: "#22c55e", bg: "#f0fdf4", label: "Accepted" },
  completed: { color: "#8b5cf6", bg: "#f5f3ff", label: "Completed" },
  rejected:  { color: "#ef4444", bg: "#fef2f2", label: "Rejected" },
};

export default function TaskHistory({ serviceRequestId }: { serviceRequestId: string }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceRequestId) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const bundle = await fhirGet(
          `Task?focus=ServiceRequest/${serviceRequestId}&_include=Task:focus&_include=Task:patient&_include=Task:requester&_include=Task:owner&_include:iterate=PractitionerRole:practitioner&_include:iterate=PractitionerRole:organization&_sort=-authored-on&_count=50`
        );
        const allResources = (bundle.entry || []).map((e: any) => e.resource);
        const orgs = new Map<string, any>(allResources.filter((r: any) => r?.resourceType === "Organization").map((r: any) => [r.id, r]));
        const roles = new Map<string, any>(allResources.filter((r: any) => r?.resourceType === "PractitionerRole").map((r: any) => [r.id, r]));
        const practitioners = new Map<string, any>(allResources.filter((r: any) => r?.resourceType === "Practitioner").map((r: any) => [r.id, r]));

        const resolveName = (ref: string, display?: string): string => {
          if (!ref) return display || "—";
          const [type, id] = ref.split("/");
          if (!id) return display || ref;

          if (type === "Organization") {
            const org = orgs.get(id);
            return org?.name || display || ref;
          }

          if (type === "Practitioner") {
            const pract = practitioners.get(id);
            return humanName(pract?.name) || display || ref;
          }

          if (type === "PractitionerRole") {
            const role = roles.get(id);
            const practRef = role?.practitioner?.reference;
            if (practRef) {
              const practId = practRef.split("/")[1];
              if (practId) {
                const pract = practitioners.get(practId);
                return humanName(pract?.name) || display || ref;
              }
            }
            return display || ref;
          }

          return display || ref;
        };

        const all = allResources.filter((r: any) => r?.resourceType === "Task");
        const enriched = all.map((t: any) => ({
          ...t,
          _resolvedRequester: resolveName(t.requester?.reference, t.requester?.display),
          _resolvedOwner: resolveName(t.owner?.reference, t.owner?.display),
        }));
        const sorted = enriched.sort(
          (a: any, b: any) =>
            new Date(a.authoredOn || 0).getTime() - new Date(b.authoredOn || 0).getTime()
        );
        setTasks(sorted);
      } catch (e) {
        setError(e instanceof FhirError ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [serviceRequestId]);

  if (loading) return <p className="muted" style={{ padding: 12 }}>Loading story…</p>;
  if (error) return <div className="alert err" style={{ margin: 12 }}>❌ {error}</div>;
  if (!tasks.length) return <p className="muted" style={{ padding: 12 }}>No story yet.</p>;

  return (
    <div style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Referral Story</h3>
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{tasks.length} step(s)</span>
      </div>

      <div style={{ position: "relative", paddingLeft: 20 }}>
        {/* Vertical connector line */}
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 10,
            bottom: 10,
            width: 2,
            background: "#e2e8f0",
            borderRadius: 1,
          }}
        />

        {tasks.map((t, idx) => {
          const meta = STATUS_META[t.status] || { color: "#64748b", bg: "#f8fafc", label: t.status };
          const requester = t._resolvedRequester || "—";
          const owner = t._resolvedOwner || "—";
          const note = t.note?.[0]?.text;
          const isLast = idx === tasks.length - 1;

          return (
            <div key={t.id || idx} style={{ position: "relative", marginBottom: isLast ? 0 : 16 }}>
              {/* Dot on the line */}
              <div
                style={{
                  position: "absolute",
                  left: -16,
                  top: 8,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: meta.color,
                  border: "2px solid #fff",
                  boxShadow: `0 0 0 2px ${meta.color}33`,
                }}
              />

              {/* Card */}
              <div
                style={{
                  background: meta.bg,
                  border: `1px solid ${meta.color}22`,
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                      color: meta.color,
                      background: "#fff",
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: `1px solid ${meta.color}33`,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b", marginLeft: "auto" }}>
                    {new Date(t.authoredOn).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                  <div>
                    <span style={{ color: "#64748b" }}>
                      {t.status === "requested" ? "Requested by" : "Action by"}
                    </span>{" "}
                    <strong>{t.status === "requested" ? requester : owner}</strong>
                  </div>
                  {note && (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${meta.color}22`, color: "#475569" }}>
                      {note}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
