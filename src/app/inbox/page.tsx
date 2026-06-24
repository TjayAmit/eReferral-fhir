"use client";

import { useEffect, useState } from "react";
import {
  listIncomingTasks, patientEverything, patchTask, FhirError,
} from "@/lib/fhir";
import {
  extractReferral, ReferralView, ACTION_POINTS, actionPatch,
  humanName, formatAddress, firstPhone,
} from "@/lib/referral";

export default function InboxPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const b = await listIncomingTasks();
      setTasks((b.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Task"));
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTasks(); }, []);

  return (
    <>
      <h1>Use Case 2 — Retrieve & Action Points</h1>
      <p className="sub">
        Discover incoming referrals (<code>Task?status=requested</code>), open one to retrieve the whole
        eReferral as a single Bundle, then update the action point.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="secondary" onClick={loadTasks} disabled={loading}>
          {loading ? "Loading…" : "Refresh inbox"}
        </button>
        <span className="muted">{tasks.length} referral task(s) requested</span>
      </div>

      {error && <div className="alert err">❌ {error}</div>}

      {!selected && (
        <div className="card">
          {tasks.length === 0 && !loading && <p className="muted">No referrals with status “requested”.</p>}
          {tasks.length > 0 && (
            <table>
              <thead><tr><th>Referral</th><th>Patient</th><th>Time Called (2.16)</th><th>Status</th></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => setSelected(t)}>
                    <td><code>{t.identifier?.[0]?.value || t.id}</code></td>
                    <td>{t.for?.display || t.for?.reference || "—"}</td>
                    <td>{t.authoredOn || "—"}</td>
                    <td><span className={`badge ${t.status}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selected && (
        <ReferralDetail
          task={selected}
          onBack={() => setSelected(null)}
          onChanged={(updated) => {
            setSelected(updated);
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          }}
        />
      )}
    </>
  );
}

function ReferralDetail({
  task, onBack, onChanged,
}: { task: any; onBack: () => void; onChanged: (t: any) => void }) {
  const [view, setView] = useState<ReferralView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const patientId = (task.for?.reference || "").split("/").pop();

  async function retrieve() {
    if (!patientId) { setError("Task has no patient reference (Task.for)."); return; }
    setLoading(true);
    setError(null);
    try {
      const bundle = await patientEverything(patientId);
      setView(extractReferral(bundle));
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { retrieve(); /* eslint-disable-next-line */ }, [task.id]);

  async function applyAction(status: string, needsNote?: boolean) {
    let reason: string | undefined;
    if (needsNote) {
      reason = window.prompt("Reason for rejection?") || undefined;
      if (reason === undefined) return;
    }
    setBusy(status);
    setNotice(null);
    setError(null);
    try {
      const updated = await patchTask(task.id, actionPatch(status, reason));
      setNotice(`Action point updated → ${status}`);
      onChanged(updated);
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const byType = view?.byType || {};
  const sr = byType["ServiceRequest"]?.[0];
  const patient = byType["Patient"]?.[0];
  const provenance = byType["Provenance"]?.[0];
  const conditions = byType["Condition"] || [];
  const observations = byType["Observation"] || [];
  const orgs = byType["Organization"] || [];
  const practitioners = byType["Practitioner"] || [];
  const procedures = byType["Procedure"] || [];
  const reports = byType["DiagnosticReport"] || [];

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={onBack}>← Inbox</button>
        <strong>{task.identifier?.[0]?.value || task.id}</strong>
        <span className={`badge ${task.status}`}>{task.status}</span>
        <button className="secondary" onClick={retrieve} disabled={loading}>
          {loading ? "Retrieving…" : "Re-retrieve Bundle"}
        </button>
      </div>

      <div className="card">
        <h2>Action points (AC 2.17–2.18)</h2>
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

      {error && <div className="alert err">❌ {error}</div>}
      {loading && <p className="muted">Retrieving eReferral Bundle…</p>}

      {view && (
        <>
          <Section title="Referral summary (AC 2.13–2.16)">
            <dl className="kv">
              <dt>Date of Referral (2.13)</dt><dd>{sr?.authoredOn || "—"}</dd>
              <dt>Referral Category (2.14)</dt><dd>{sr?.priority || "—"}</dd>
              <dt>Reason for Referral (2.15)</dt>
              <dd>{sr?.category?.[0]?.coding?.[0]?.display || sr?.category?.[0]?.text || "—"}</dd>
              <dt>Time Called (2.16)</dt><dd>{task.authoredOn || "—"}</dd>
            </dl>
          </Section>

          <Section title="Patient (AC 2.19–2.27)">
            {patient ? (
              <dl className="kv">
                <dt>Full Name (2.19)</dt><dd>{humanName(patient.name)}</dd>
                <dt>Sex (2.20)</dt><dd>{patient.gender || "—"}</dd>
                <dt>Birth Date (2.21)</dt><dd>{patient.birthDate || "—"}</dd>
                <dt>PhilSys (2.23)</dt>
                <dd>{idVal(patient, "philsys") || "—"}</dd>
                <dt>PhilHealth (2.24)</dt>
                <dd>{idVal(patient, "philhealth") || "—"}</dd>
                <dt>Address (2.25)</dt><dd>{formatAddress(patient.address)}</dd>
                <dt>Contact Number (2.26)</dt><dd>{firstPhone(patient.telecom)}</dd>
                <dt>Next of Kin (2.27)</dt>
                <dd>{patient.contact?.[0] ? humanName(patient.contact[0].name) : "—"}</dd>
              </dl>
            ) : <p className="muted">No Patient in bundle.</p>}
          </Section>

          <Section title="Practitioners & Facilities (AC 2.01–2.12)">
            <div className="grid two">
              <div>
                <h3 className="muted">Practitioners</h3>
                {practitioners.map((p, k) => <div key={k}>{humanName(p.name)}</div>)}
                {practitioners.length === 0 && <span className="muted">—</span>}
              </div>
              <div>
                <h3 className="muted">Organizations</h3>
                {orgs.map((o, k) => (
                  <div key={k}>{o.name} · NHFR {idVal(o, "nhfr") || "—"}</div>
                ))}
                {orgs.length === 0 && <span className="muted">—</span>}
              </div>
            </div>
          </Section>

          <Section title="Conditions (AC 2.29–2.31)">
            {conditions.map((c, k) => (
              <div key={k}>
                <strong>{c.category?.[0]?.coding?.[0]?.code || "condition"}:</strong>{" "}
                {c.code?.text || c.code?.coding?.[0]?.display || "—"}
                {c.note?.[0]?.text ? <div className="muted">{c.note[0].text}</div> : null}
              </div>
            ))}
            {conditions.length === 0 && <span className="muted">—</span>}
          </Section>

          <Section title="Vital signs (AC 2.32–2.37)">
            <table>
              <thead><tr><th>Observation</th><th>Value</th><th>Effective</th></tr></thead>
              <tbody>
                {observations.map((o, k) => (
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

          <Section title="Treatment & Labs (AC 2.38–2.39)">
            <dl className="kv">
              <dt>Treatment Given (2.38)</dt>
              <dd>{procedures[0]?.note?.[0]?.text || "—"}</dd>
              <dt>Laboratory Results (2.39)</dt>
              <dd>{reports[0]?.presentedForm?.[0]?.title || (reports[0] ? "attachment present" : "—")}</dd>
            </dl>
          </Section>

          <Section title="Signature / Provenance (AC 2.04–2.05)">
            <dl className="kv">
              <dt>Recorded (2.04)</dt><dd>{provenance?.recorded || "—"}</dd>
              <dt>Signature (2.05)</dt>
              <dd>{provenance?.signature?.[0]?.data ? "present (" + (provenance.signature[0].sigFormat || "signed") + ")" : "—"}</dd>
            </dl>
          </Section>
        </>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function idVal(res: any, kind: "nhfr" | "philsys" | "philhealth"): string | undefined {
  const match = (res.identifier || []).find((i: any) => (i.system || "").includes(kind === "nhfr" ? "nhfr" : kind));
  return match?.value;
}

function obsValue(o: any): string {
  if (o.valueQuantity) return `${o.valueQuantity.value} ${o.valueQuantity.unit || ""}`.trim();
  if (o.component?.length) {
    return o.component
      .map((c: any) => `${c.valueQuantity?.value}${c.valueQuantity?.unit || ""}`)
      .join(" / ");
  }
  return "—";
}
