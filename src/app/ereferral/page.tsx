"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fhirGet, patientEverything, fhirPost, FhirError } from "@/lib/fhir";
import {
  extractReferral, ReferralView, ACTION_POINTS,
  humanName, formatAddress, firstPhone, latestTask, buildNextTask,
} from "@/lib/referral";

// ── types ─────────────────────────────────────────────────────────────────────

type ReferralItem = { sr: any; task: any | null; patient: any | null };

// ── helpers ───────────────────────────────────────────────────────────────────

function idVal(res: any, kind: string): string | undefined {
  return (res?.identifier || []).find((i: any) => (i.system || "").includes(kind))?.value;
}

function roleDisplay(pr: any): string {
  return pr?.code?.[0]?.coding?.[0]?.display || pr?.code?.[0]?.text || "—";
}

function obsValue(o: any): string {
  if (o.valueQuantity) return `${o.valueQuantity.value} ${o.valueQuantity.unit || ""}`.trim();
  if (o.component?.length)
    return o.component.map((c: any) => `${c.valueQuantity?.value}${c.valueQuantity?.unit || ""}`).join(" / ");
  return "—";
}

function refId(reference: string): string {
  return reference?.split("/").pop() || "";
}

// ── Profile bar ───────────────────────────────────────────────────────────────

function ProfileBar({ user }: { user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const nhfr = idVal(user.organization, "nhfr-code");
  return (
    <div className="card" style={{ marginBottom: 20, display: "flex", gap: 32, flexWrap: "wrap" }}>
      <dl className="kv" style={{ flex: 1, minWidth: 180, margin: 0 }}>
        <dt>Practitioner</dt><dd>{humanName(user.practitioner?.name)}</dd>
        <dt>Role</dt><dd>{roleDisplay(user.practitionerRole)}</dd>
      </dl>
      <dl className="kv" style={{ flex: 1, minWidth: 180, margin: 0 }}>
        <dt>Organization</dt><dd>{user.organization?.name || "—"}</dd>
        {nhfr && <><dt>NHFR</dt><dd>{nhfr}</dd></>}
      </dl>
    </div>
  );
}

// ── Status filter pills ───────────────────────────────────────────────────────

const STATUSES = ["requested", "received", "accepted", "rejected", "completed"] as const;

function StatusFilter({ value, counts, onChange }: {
  value: string; counts: Record<string, number>; onChange: (s: string) => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="status-filters">
      <button className={`status-pill${value === "" ? " active-all" : ""}`} onClick={() => onChange("")}>
        All ({total})
      </button>
      {STATUSES.map((s) => (
        <button key={s} className={`status-pill${value === s ? ` active-${s}` : ""}`} onClick={() => onChange(s)}>
          {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s] ?? 0})
        </button>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><h2>{title}</h2>{children}</div>;
}

// ── Referral detail ───────────────────────────────────────────────────────────

function ReferralDetail({
  sr, task, onBack, onChanged,
}: { sr: any; task: any | null; onBack: () => void; onChanged: (t: any) => void }) {
  const [view, setView] = useState<ReferralView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Patient comes from SR.subject or Task.for
  const patientId = refId(sr?.subject?.reference || task?.for?.reference || "");
  const displayId = sr?.identifier?.[0]?.value || task?.identifier?.[0]?.value || sr?.id;
  const status = task?.status || sr?.status || "unknown";

  async function retrieve() {
    if (!patientId) { setError("No patient reference found on this referral."); return; }
    setLoading(true); setError(null);
    try {
      setView(extractReferral(await patientEverything(patientId)));
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { retrieve(); }, [sr?.id]);

  async function applyAction(status: string, needsNote?: boolean) {
    if (!task) return;
    let reason: string | undefined;
    if (needsNote) {
      reason = window.prompt("Reason for rejection?") || undefined;
      if (reason === undefined) return;
    }
    setBusy(status); setNotice(null); setError(null);
    try {
      const newTask = buildNextTask(task, status, reason);
      const updated = await fhirPost("Task", newTask);
      setNotice(`Action point updated → ${status}`);
      onChanged(updated);
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setBusy(null); }
  }

  const byType = view?.byType || {};
  const srDetail      = byType["ServiceRequest"]?.[0];
  const patient       = byType["Patient"]?.[0];
  const provenance    = byType["Provenance"]?.[0];
  const conditions    = byType["Condition"] || [];
  const observations  = byType["Observation"] || [];
  const orgs          = byType["Organization"] || [];
  const practitioners = byType["Practitioner"] || [];
  const procedures    = byType["Procedure"] || [];
  const reports       = byType["DiagnosticReport"] || [];

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={onBack}>← Back to list</button>
        <strong>{displayId}</strong>
        <span className={`badge ${status}`}>{status}</span>
        <button className="secondary" onClick={retrieve} disabled={loading}>
          {loading ? "Retrieving…" : "Re-retrieve Bundle"}
        </button>
      </div>

      {task && (
        <div className="card">
          <h2>Action points</h2>
          <div className="row">
            {ACTION_POINTS.map((a) => (
              <button key={a.status} className={a.status === "rejected" ? "ghost" : ""}
                onClick={() => applyAction(a.status, a.note)} disabled={!!busy}>
                {busy === a.status ? "…" : a.label}
              </button>
            ))}
          </div>
          {notice && <div className="alert ok">✅ {notice}</div>}
        </div>
      )}

      {error && <div className="alert err">❌ {error}</div>}
      {loading && <p className="muted">Retrieving eReferral Bundle…</p>}

      {view && (
        <>
          <Section title="Referral summary">
            <dl className="kv">
              <dt>Date of Referral</dt><dd>{srDetail?.authoredOn || sr?.authoredOn || "—"}</dd>
              <dt>Priority</dt><dd>{srDetail?.priority || sr?.priority || "—"}</dd>
              <dt>Reason for Referral</dt>
              <dd>{srDetail?.category?.[0]?.coding?.[0]?.display || srDetail?.category?.[0]?.text || "—"}</dd>
              <dt>Time Called</dt><dd>{task?.authoredOn || "—"}</dd>
            </dl>
          </Section>

          <Section title="Patient">
            {patient ? (
              <dl className="kv">
                <dt>Full Name</dt><dd>{humanName(patient.name)}</dd>
                <dt>Sex</dt><dd>{patient.gender || "—"}</dd>
                <dt>Birth Date</dt><dd>{patient.birthDate || "—"}</dd>
                <dt>PhilSys</dt><dd>{idVal(patient, "philsys") || "—"}</dd>
                <dt>PhilHealth</dt><dd>{idVal(patient, "philhealth") || "—"}</dd>
                <dt>Address</dt><dd>{formatAddress(patient.address)}</dd>
                <dt>Contact Number</dt><dd>{firstPhone(patient.telecom)}</dd>
                <dt>Next of Kin</dt>
                <dd>{patient.contact?.[0] ? humanName(patient.contact[0].name) : "—"}</dd>
              </dl>
            ) : <p className="muted">No Patient in bundle.</p>}
          </Section>

          <Section title="Practitioners & Facilities">
            <div className="grid two">
              <div>
                <h3 className="muted">Practitioners</h3>
                {practitioners.map((p: any, k: number) => <div key={k}>{humanName(p.name)}</div>)}
                {practitioners.length === 0 && <span className="muted">—</span>}
              </div>
              <div>
                <h3 className="muted">Organizations</h3>
                {orgs.map((o: any, k: number) => (
                  <div key={k}>{o.name}{idVal(o, "nhfr") ? ` · NHFR ${idVal(o, "nhfr")}` : ""}</div>
                ))}
                {orgs.length === 0 && <span className="muted">—</span>}
              </div>
            </div>
          </Section>

          <Section title="Conditions">
            {conditions.map((c: any, k: number) => (
              <div key={k}>
                <strong>{c.category?.[0]?.coding?.[0]?.code || "condition"}:</strong>{" "}
                {c.code?.text || c.code?.coding?.[0]?.display || "—"}
                {c.note?.[0]?.text ? <div className="muted">{c.note[0].text}</div> : null}
              </div>
            ))}
            {conditions.length === 0 && <span className="muted">—</span>}
          </Section>

          <Section title="Vital signs">
            <table>
              <thead><tr><th>Observation</th><th>Value</th><th>Effective</th></tr></thead>
              <tbody>
                {observations.map((o: any, k: number) => (
                  <tr key={k}>
                    <td>{o.code?.coding?.[0]?.display || "—"}</td>
                    <td>{obsValue(o)}</td>
                    <td>{o.effectiveDateTime || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {observations.length === 0 && <span className="muted">—</span>}
          </Section>

          <Section title="Treatment & Labs">
            <dl className="kv">
              <dt>Treatment Given</dt><dd>{procedures[0]?.note?.[0]?.text || "—"}</dd>
              <dt>Laboratory Results</dt>
              <dd>{reports[0]?.presentedForm?.[0]?.title || (reports[0] ? "attachment present" : "—")}</dd>
            </dl>
          </Section>

          <Section title="Provenance">
            <dl className="kv">
              <dt>Recorded</dt><dd>{provenance?.recorded || "—"}</dd>
              <dt>Signature</dt>
              <dd>{provenance?.signature?.[0]?.data
                ? `present (${provenance.signature[0].sigFormat || "signed"})`
                : "—"}</dd>
            </dl>
          </Section>
        </>
      )}
    </>
  );
}

// ── Practitioner home ─────────────────────────────────────────────────────────

function PractitionerHome({ user }: { user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const orgId = user.organization?.id;
  const [items, setItems] = useState<ReferralItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<ReferralItem | null>(null);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function load() {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      const bundle = await fhirGet(
        `ServiceRequest?performer=Organization/${orgId}&_include=ServiceRequest:subject&_revinclude=Task:focus&_sort=-authored&_count=100`
      );

      const all = (bundle.entry || []).map((e: any) => e.resource).filter(Boolean);
      const srs = all.filter((r: any) => r.resourceType === "ServiceRequest");

      // Patient lookup by id
      const patientById = new Map<string, any>(
        all.filter((r: any) => r.resourceType === "Patient").map((p: any) => [p.id, p])
      );

      // Task lookup by the SR id it focuses on
      const tasksBySrId = new Map<string, any[]>();
      for (const t of all.filter((r: any) => r.resourceType === "Task")) {
        const srId = refId(t.focus?.reference || "");
        if (srId) {
          if (!tasksBySrId.has(srId)) tasksBySrId.set(srId, []);
          tasksBySrId.get(srId)!.push(t);
        }
      }

      setItems(srs.map((sr: any) => ({
        sr,
        task: latestTask(tasksBySrId.get(sr.id) || []) || null,
        patient: patientById.get(refId(sr.subject?.reference || "")) || null,
      })));
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setLoading(false); }
  }

  const statusCounts = items.reduce<Record<string, number>>((acc, { sr, task }) => {
    const s = task?.status || sr.status || "unknown";
    acc[s] = (acc[s] ?? 0) + 1; return acc;
  }, {});

  const filtered = items.filter(({ sr, task, patient }) => {
    const status = task?.status || sr.status;
    if (statusFilter && status !== statusFilter) return false;
    const text = [
      sr.identifier?.[0]?.value || sr.id,
      humanName(patient?.name),
      sr.subject?.display,
      status,
      sr.priority,
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  });

  if (selected) {
    return (
      <>
        <ProfileBar user={user} />
        <ReferralDetail
          sr={selected.sr}
          task={selected.task}
          onBack={() => setSelected(null)}
          onChanged={(updatedTask) =>
            setSelected((prev) => prev ? { ...prev, task: updatedTask } : prev)
          }
        />
      </>
    );
  }

  return (
    <>
      <h1>Incoming Referrals</h1>
      <p className="sub">
        Referrals where your organization is the performer
        (<code>ServiceRequest.performer = Organization/{orgId || "…"}</code>).
      </p>

      <ProfileBar user={user} />

      <div className="row" style={{ marginBottom: 8 }}>
        <input
          type="search"
          placeholder="Search referral, patient…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <button className="secondary" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <span className="muted">{filtered.length} referral(s)</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <StatusFilter value={statusFilter} counts={statusCounts} onChange={setStatusFilter} />
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No incoming referrals found for your organization.</p>
        )}
        {filtered.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Referral ID</th>
                <th>Patient</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ sr, task, patient }) => {
                const status = task?.status || sr.status || "—";
                return (
                  <tr key={sr.id} className="clickable"
                    onClick={() => setSelected(items.find((i) => i.sr.id === sr.id) || null)}>
                    <td><code>{sr.identifier?.[0]?.value || sr.id}</code></td>
                    <td>{humanName(patient?.name) || sr.subject?.display || "—"}</td>
                    <td>{sr.priority || "—"}</td>
                    <td><span className={`badge ${status}`}>{status}</span></td>
                    <td>{sr.authoredOn ? new Date(sr.authoredOn).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ── Root page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, ready } = useAuth();

  if (!ready) return <div className="loading">Loading…</div>;

  if (!user?.practitionerId) {
    return (
      <>
        <h1>PH eReferral — Track 1</h1>
        <p className="sub">Select a use case to begin.</p>
        <div className="home-cards">
          <Link href="/ereferral/submit" className="card" style={{ display: "block" }}>
            <h2>New Referral</h2>
            <p className="muted">Submit one <strong>transaction Bundle</strong> to the SHR.</p>
          </Link>
          <Link href="/inbox" className="card" style={{ display: "block" }}>
            <h2>Use Case 2 — Retrieve</h2>
            <p className="muted">Retrieve the eReferral Bundle and update action points.</p>
          </Link>
        </div>
      </>
    );
  }

  return <PractitionerHome user={user} />;
}
