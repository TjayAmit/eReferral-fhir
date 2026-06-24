"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { fhirGet, FhirError } from "@/lib/fhir";
import { humanName } from "@/lib/referral";

const STATUSES = ["requested", "received", "accepted", "rejected", "completed"] as const;

function buildIndex(bundle: any): Map<string, any> {
  const map = new Map<string, any>();
  for (const entry of bundle?.entry || []) {
    if (entry.fullUrl) map.set(entry.fullUrl, entry.resource);
    if (entry.resource?.resourceType && entry.resource?.id) {
      map.set(`${entry.resource.resourceType}/${entry.resource.id}`, entry.resource);
    }
  }
  return map;
}

function srReason(sr: any): string {
  return (
    sr?.category?.[0]?.coding?.[0]?.display ||
    sr?.category?.[0]?.text ||
    sr?.reasonCode?.[0]?.coding?.[0]?.display ||
    "—"
  );
}

export default function OutgoingReferralsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const practitionerRoleId = user?.practitionerRole?.id;

  const [tasks, setTasks] = useState<any[]>([]);
  const [index, setIndex] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  useEffect(() => { setPage(1); }, [query, statusFilter]);

  // Persist the requested-referral fetch: list Tasks requested by this
  // practitioner role, with their ServiceRequest (focus) and Patient included.
  async function load() {
    if (!practitionerRoleId) return;
    setLoading(true);
    setError(null);
    try {
      const bundle = await fhirGet(
        `Task?requester=PractitionerRole/${practitionerRoleId}&_include=Task:focus&_include=Task:patient&_sort=-authored-on&_count=100`
      );
      setIndex(buildIndex(bundle));
      setTasks(
        (bundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Task")
      );
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function getServiceRequest(task: any): any {
    return task.focus?.reference ? index.get(task.focus.reference) : undefined;
  }

  function getPatient(task: any): any {
    return task.for?.reference ? index.get(task.for.reference) : undefined;
  }

  function patientName(task: any): string {
    const p = getPatient(task);
    return p ? humanName(p.name) : task.for?.display || "—";
  }

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  if (!practitionerRoleId) {
    return (
      <>
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Requested Referrals" }]} title="Requested Referrals" />
        <div className="alert err">No practitioner role linked to your account — contact an admin.</div>
      </>
    );
  }

  const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = tasks.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    const sr = getServiceRequest(t);
    const text = [
      t.identifier?.[0]?.value || t.id,
      patientName(t),
      t.status,
      t.priority,
      srReason(sr),
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Requested Referrals" }]} title="Requested Referrals" />

      {/* Redesigned header — matches Incoming Referrals */}
      <div className="incoming-header">
        <div className="incoming-header-top">
          <div>
            <h1 className="incoming-header-title">Requested Referrals</h1>
            <p className="incoming-header-sub">
              Referrals requested by your practitioner role{" "}
              <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
                Task.requester = PractitionerRole/{practitionerRoleId}
              </code>
            </p>
          </div>
          <div className="incoming-header-actions">
            <input
              type="search"
              placeholder="Search referral, patient…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="incoming-stats">
          <div className={`incoming-stat${statusFilter === "" ? " active" : ""}`} onClick={() => setStatusFilter("")}>
            <div className="incoming-stat-n">{Object.values(statusCounts).reduce((a, b) => a + b, 0)}</div>
            <div className="incoming-stat-l">All</div>
          </div>
          {STATUSES.map((s) => (
            <div
              key={s}
              className={`incoming-stat${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              <div className="incoming-stat-n">{statusCounts[s] ?? 0}</div>
              <div className="incoming-stat-l">{s.charAt(0).toUpperCase() + s.slice(1)}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No requested referrals found for your organization.</p>
        )}
        {filtered.length > 0 && (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Referral ID</th>
                  <th>Patient</th>
                  <th>Reason</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const sr = getServiceRequest(t);
                  const refId = t.identifier?.[0]?.value || t.id;
                  const srId = sr?.id;
                  return (
                    <tr
                      key={t.id}
                      className={srId ? "clickable" : undefined}
                      onClick={srId ? () => router.push(`/referrals/outgoing/${srId}`) : undefined}
                    >
                      <td><code>{refId}</code></td>
                      <td>{patientName(t)}</td>
                      <td>{srReason(sr)}</td>
                      <td>{t.priority || "—"}</td>
                      <td><span className={`badge ${t.status}`}>{t.status}</span></td>
                      <td>{t.authoredOn ? new Date(t.authoredOn).toLocaleDateString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
