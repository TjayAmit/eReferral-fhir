"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { fhirGet, patchTask, FhirError } from "@/lib/fhir";
import { ACTION_POINTS, actionPatch, humanName, formatAddress, firstPhone } from "@/lib/referral";

// ── types ─────────────────────────────────────────────────────────────────────

type ReferralItem = { sr: any; task: any | null; patient: any | null };

type DetailData = {
  patient: any | null;
  requesterOrg: any | null;
  performerOrg: any | null;
  provenance: any | null;
  task: any | null;
  encounter: any | null;
  observations: any[];
  conditions: any[];
  procedures: any[];
  diagnosticReports: any[];
};

// ── helpers ───────────────────────────────────────────────────────────────────

function idVal(res: any, kind: string): string | undefined {
  return (res?.identifier || []).find((i: any) => (i.system || "").includes(kind))?.value;
}

function refId(ref: string): string {
  return ref?.split("/").pop() || "";
}

function dedupeResources(bundle: any): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const e of bundle?.entry || []) {
    const r = e.resource;
    if (!r) continue;
    const key = `${r.resourceType}/${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
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
  sr, task: taskProp, onBack, onChanged,
}: { sr: any; task: any | null; onBack: () => void; onChanged: (t: any) => void }) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Task from detail fetch is fresher (has latest status)
  const activeTask = detail?.task ?? taskProp;
  const status = activeTask?.status || sr?.status || "unknown";
  const displayId = sr?.identifier?.[0]?.value || sr?.id;

  async function retrieve() {
    setLoading(true); setError(null);
    try {
      // Step 1: Fetch ServiceRequest with basic includes
      const bundle = await fhirGet(
        `ServiceRequest?_id=${sr.id}` +
        `&_include=ServiceRequest:subject` +
        `&_include=ServiceRequest:requester` +
        `&_include=ServiceRequest:performer` +
        `&_revinclude=Task:focus` +
        `&_revinclude=Provenance:target`
      );

      const all = dedupeResources(bundle);
      const orgs = all.filter((r) => r.resourceType === "Organization");
      const provenances = all.filter((r) => r.resourceType === "Provenance");

      const requesterOrgId = refId(sr.requester?.reference || "");
      const performerOrgId = refId(sr.performer?.[0]?.reference || "");

      // Use the most recently updated provenance
      const latestProvenance = provenances.sort((a, b) =>
        new Date(b.meta?.lastUpdated || 0).getTime() - new Date(a.meta?.lastUpdated || 0).getTime()
      )[0] || null;

      const patient = all.find((r) => r.resourceType === "Patient") || null;
      const task = all.find((r) => r.resourceType === "Task") || null;

      // Step 2: Fetch encounter with _revinclude for Observations
      let encounter = null;
      let observations: any[] = [];
      if (sr.encounter?.reference) {
        const encounterId = sr.encounter.reference.split('/').pop();
        const encounterBundle = await fhirGet(`Encounter?_id=${encounterId}&_revinclude=Observation:encounter`);
        encounter = encounterBundle.entry?.find((e: any) => e.resource?.resourceType === "Encounter")?.resource || null;
        observations = (encounterBundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Observation");
      }

      // Step 3: Fetch Conditions by patient
      let conditions: any[] = [];
      if (patient) {
        const conditionBundle = await fhirGet(`Condition?subject=Patient/${patient.id}`);
        conditions = (conditionBundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Condition");
      }

      // Step 4: Fetch Procedures by patient
      let procedures: any[] = [];
      if (patient) {
        const procBundle = await fhirGet(`Procedure?subject=Patient/${patient.id}`);
        procedures = (procBundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Procedure");
      }

      // Step 5: Fetch DiagnosticReports by patient
      let diagnosticReports: any[] = [];
      if (patient) {
        const drBundle = await fhirGet(`DiagnosticReport?subject=Patient/${patient.id}`);
        diagnosticReports = (drBundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "DiagnosticReport");
      }

      setDetail({
        patient,
        requesterOrg: orgs.find((o) => o.id === requesterOrgId) || null,
        performerOrg: orgs.find((o) => o.id === performerOrgId) || null,
        task,
        provenance: latestProvenance,
        encounter,
        observations,
        conditions,
        procedures,
        diagnosticReports,
      });
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { retrieve(); }, [sr?.id]);

  async function applyAction(s: string, needsNote?: boolean) {
    if (!activeTask) return;
    let reason: string | undefined;
    if (needsNote) {
      reason = window.prompt("Reason for rejection?") || undefined;
      if (reason === undefined) return;
    }
    setBusy(s); setNotice(null); setError(null);
    try {
      const updated = await patchTask(activeTask.id, actionPatch(s, reason));
      setNotice(`Action point updated → ${s}`);
      onChanged(updated);
      // Refresh to pull the new status
      retrieve();
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setBusy(null); }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={onBack}>← Back to list</button>
        <strong>{displayId}</strong>
        <span className={`badge ${status}`}>{status}</span>
        <button className="secondary" onClick={retrieve} disabled={loading}>
          {loading ? "Retrieving…" : "Refresh"}
        </button>
      </div>

      {/* Action points */}
      {activeTask && (
        <div className="card">
          <h2>Action points</h2>
          <div className="row">
            {ACTION_POINTS.map((a) => (
              <button
                key={a.status}
                className={a.status === "rejected" ? "ghost" : ""}
                onClick={() => applyAction(a.status, a.note)}
                disabled={!!busy}
              >
                {busy === a.status ? "…" : a.label}
              </button>
            ))}
          </div>
          {notice && <div className="alert ok">✅ {notice}</div>}
        </div>
      )}

      {error && <div className="alert err">❌ {error}</div>}
      {loading && <p className="muted">Loading referral details…</p>}

      {detail && (
        <>
          {/* Referral summary */}
          <Section title="Referral summary">
            <dl className="kv">
              <dt>Referral ID</dt>
              <dd>{sr.identifier?.[0]?.value || sr.id}</dd>
              <dt>Date of Referral</dt>
              <dd>{sr.authoredOn ? new Date(sr.authoredOn).toLocaleString() : "—"}</dd>
              <dt>Priority</dt>
              <dd>{sr.priority || "—"}</dd>
              <dt>Reason for Referral</dt>
              <dd>{sr.category?.[0]?.coding?.[0]?.display || sr.category?.[0]?.text || "—"}</dd>
              <dt>Status</dt>
              <dd><span className={`badge ${status}`}>{status}</span></dd>
            </dl>
          </Section>

          {/* Facilities */}
          <Section title="Facilities">
            <div className="grid two">
              <dl className="kv" style={{ margin: 0 }}>
                <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}>
                  Initiating (Requester)
                </dt>
                <dt>Name</dt>
                <dd>{detail.requesterOrg?.name || refId(sr.requester?.reference || "") || "—"}</dd>
                <dt>NHFR</dt>
                <dd>{idVal(detail.requesterOrg, "nhfr") || "—"}</dd>
              </dl>
              <dl className="kv" style={{ margin: 0 }}>
                <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}>
                  Receiving (Performer)
                </dt>
                <dt>Name</dt>
                <dd>{detail.performerOrg?.name || refId(sr.performer?.[0]?.reference || "") || "—"}</dd>
                <dt>NHFR</dt>
                <dd>{idVal(detail.performerOrg, "nhfr") || "—"}</dd>
              </dl>
            </div>
          </Section>

          {/* Patient */}
          <Section title="Patient">
            {detail.patient ? (
              <dl className="kv">
                <dt>Full Name</dt><dd>{humanName(detail.patient.name)}</dd>
                <dt>Sex</dt><dd>{detail.patient.gender || "—"}</dd>
                <dt>Birth Date</dt><dd>{detail.patient.birthDate || "—"}</dd>
                <dt>PhilHealth</dt><dd>{idVal(detail.patient, "philhealth") || "—"}</dd>
                <dt>PhilSys</dt><dd>{idVal(detail.patient, "philsys") || "—"}</dd>
                <dt>Address</dt><dd>{formatAddress(detail.patient.address)}</dd>
                <dt>Contact Number</dt><dd>{firstPhone(detail.patient.telecom)}</dd>
                <dt>Next of Kin</dt>
                <dd>{detail.patient.contact?.[0] ? humanName(detail.patient.contact[0].name) : "—"}</dd>
              </dl>
            ) : <p className="muted">No patient data available.</p>}
          </Section>

          {/* Provenance */}
          <Section title="Provenance">
            {detail.provenance ? (
              <dl className="kv">
                <dt>Recorded</dt>
                <dd>{detail.provenance.recorded
                  ? new Date(detail.provenance.recorded).toLocaleString() : "—"}</dd>
                <dt>Author</dt>
                <dd>{detail.provenance.agent?.[0]?.who?.reference || "—"}</dd>
                <dt>Signature</dt>
                <dd>{detail.provenance.signature?.[0]?.data
                  ? `present (${detail.provenance.signature[0].sigFormat || "signed"})`
                  : "—"}</dd>
              </dl>
            ) : <p className="muted">No provenance data.</p>}
          </Section>

          {/* Encounter */}
          {detail.encounter && (
            <Section title="Encounter">
              <dl className="kv">
                <dt>Status</dt>
                <dd>{detail.encounter.status || "—"}</dd>
                <dt>Class</dt>
                <dd>{detail.encounter.class?.display || detail.encounter.class?.code || "—"}</dd>
                <dt>Period</dt>
                <dd>
                  {detail.encounter.period?.start && detail.encounter.period?.end
                    ? `${new Date(detail.encounter.period.start).toLocaleString()} - ${new Date(detail.encounter.period.end).toLocaleString()}`
                    : detail.encounter.period?.start
                    ? new Date(detail.encounter.period.start).toLocaleString()
                    : "—"}
                </dd>
              </dl>
            </Section>
          )}

          {/* Observations / Vitals */}
          {detail.observations.length > 0 && (
            <Section title={`Observations / Vitals (${detail.observations.length})`}>
              {detail.observations.map((o, idx) => (
                <div key={o.id || idx} style={{ marginBottom: idx < detail.observations.length - 1 ? 12 : 0, paddingBottom: idx < detail.observations.length - 1 ? 12 : 0, borderBottom: idx < detail.observations.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <dl className="kv">
                    <dt>Code</dt>
                    <dd>{o.code?.coding?.[0]?.display || o.code?.text || "—"}</dd>
                    <dt>Value</dt>
                    <dd>
                      {o.valueQuantity 
                        ? `${o.valueQuantity.value} ${o.valueQuantity.unit}`
                        : o.valueCodeableConcept?.text || o.valueString || "—"}
                    </dd>
                    <dt>Status</dt>
                    <dd>{o.status || "—"}</dd>
                    <dt>Effective</dt>
                    <dd>{o.effectiveDateTime ? new Date(o.effectiveDateTime).toLocaleString() : "—"}</dd>
                  </dl>
                </div>
              ))}
            </Section>
          )}

          {/* Conditions */}
          {detail.conditions.length > 0 && (
            <Section title={`Conditions / Diagnoses (${detail.conditions.length})`}>
              {detail.conditions.map((c, idx) => (
                <div key={c.id || idx} style={{ marginBottom: idx < detail.conditions.length - 1 ? 12 : 0, paddingBottom: idx < detail.conditions.length - 1 ? 12 : 0, borderBottom: idx < detail.conditions.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <dl className="kv">
                    <dt>Code</dt>
                    <dd>{c.code?.coding?.[0]?.display || c.code?.text || "—"}</dd>
                    <dt>Clinical Status</dt>
                    <dd>{c.clinicalStatus?.coding?.[0]?.display || "—"}</dd>
                    {c.note?.[0]?.text && (
                      <>
                        <dt>Notes</dt>
                        <dd>{c.note[0].text}</dd>
                      </>
                    )}
                  </dl>
                </div>
              ))}
            </Section>
          )}

          {/* Procedures */}
          {detail.procedures.length > 0 && (
            <Section title={`Procedures (${detail.procedures.length})`}>
              {detail.procedures.map((p, idx) => (
                <div key={p.id || idx} style={{ marginBottom: idx < detail.procedures.length - 1 ? 12 : 0, paddingBottom: idx < detail.procedures.length - 1 ? 12 : 0, borderBottom: idx < detail.procedures.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <dl className="kv">
                    <dt>Code</dt>
                    <dd>{p.code?.coding?.[0]?.display || p.code?.text || "—"}</dd>
                    <dt>Status</dt>
                    <dd>{p.status || "—"}</dd>
                    {p.note?.[0]?.text && (
                      <>
                        <dt>Notes</dt>
                        <dd>{p.note[0].text}</dd>
                      </>
                    )}
                  </dl>
                </div>
              ))}
            </Section>
          )}

          {/* Diagnostic Reports */}
          {detail.diagnosticReports.length > 0 && (
            <Section title={`Diagnostic Reports (${detail.diagnosticReports.length})`}>
              {detail.diagnosticReports.map((dr, idx) => (
                <div key={dr.id || idx} style={{ marginBottom: idx < detail.diagnosticReports.length - 1 ? 12 : 0, paddingBottom: idx < detail.diagnosticReports.length - 1 ? 12 : 0, borderBottom: idx < detail.diagnosticReports.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <dl className="kv">
                    <dt>Code</dt>
                    <dd>{dr.code?.coding?.[0]?.display || dr.code?.text || "—"}</dd>
                    <dt>Status</dt>
                    <dd>{dr.status || "—"}</dd>
                    {dr.conclusion && (
                      <>
                        <dt>Conclusion</dt>
                        <dd>{dr.conclusion}</dd>
                      </>
                    )}
                  </dl>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IncomingReferralsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const orgId = user?.organization?.id;

  const [items, setItems] = useState<ReferralItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReferralItem | null>(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && orgId) load();
  }, [ready, orgId]);

  useEffect(() => { setPage(1); }, [query, statusFilter]);

  async function load() {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      const bundle = await fhirGet(
        `ServiceRequest?performer=Organization/${orgId}&_include=ServiceRequest:subject&_revinclude=Task:focus&_sort=-authored&_count=100`
      );

      const all = dedupeResources(bundle);
      const srs = all.filter((r) => r.resourceType === "ServiceRequest");

      const patientById = new Map<string, any>(
        all.filter((r) => r.resourceType === "Patient").map((p) => [p.id, p])
      );
      const taskBySrId = new Map<string, any>();
      for (const t of all.filter((r) => r.resourceType === "Task")) {
        const srId = refId(t.focus?.reference || "");
        if (srId) taskBySrId.set(srId, t);
      }

      setItems(srs.map((sr) => ({
        sr,
        task:    taskBySrId.get(sr.id) || null,
        patient: patientById.get(refId(sr.subject?.reference || "")) || null,
      })));
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setLoading(false); }
  }

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  if (!orgId) {
    return (
      <>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Incoming Referrals" }]} />
        <div className="alert err">No organization linked to your account — contact an admin.</div>
      </>
    );
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (selected) {
    return (
      <>
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "Incoming Referrals", href: "/referrals/incoming" },
          { label: selected.sr?.identifier?.[0]?.value || selected.sr?.id },
        ]} />
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
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Incoming Referrals" }]} />

      <PageHeader
        title="Incoming Referrals"
        actions={
          <>
            <input
              type="search"
              placeholder="Search referral, patient…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="secondary" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <span className="muted">{filtered.length} referral(s)</span>
          </>
        }
      />

      <p className="sub" style={{ marginTop: -8, marginBottom: 12 }}>
        Referrals where your organization is the performer
        (<code>ServiceRequest.performer = Organization/{orgId}</code>).
      </p>

      <div style={{ marginBottom: 14 }}>
        <StatusFilter value={statusFilter} counts={statusCounts} onChange={setStatusFilter} />
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="card">
        {filtered.length === 0 && !loading && (
          <p className="muted">No incoming referrals found for your organization.</p>
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
                {pageRows.map(({ sr, task, patient }) => {
                  const status = task?.status || sr.status || "—";
                  return (
                    <tr key={sr.id} className="clickable"
                      onClick={() => setSelected(items.find((i) => i.sr.id === sr.id) || null)}>
                      <td><code>{sr.identifier?.[0]?.value || sr.id}</code></td>
                      <td>{humanName(patient?.name) || sr.subject?.display || "—"}</td>
                      <td>{sr.category?.[0]?.coding?.[0]?.display || sr.category?.[0]?.text || "—"}</td>
                      <td>{sr.priority || "—"}</td>
                      <td><span className={`badge ${status}`}>{status}</span></td>
                      <td>{sr.authoredOn ? new Date(sr.authoredOn).toLocaleDateString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={currentPage} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
