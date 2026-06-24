"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
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

/** Human-readable Observation value, including BP and other component panels. */
function obsValue(o: any): string {
  if (o?.valueQuantity) return `${o.valueQuantity.value} ${o.valueQuantity.unit || ""}`.trim();
  if (o?.valueCodeableConcept) return o.valueCodeableConcept.text || o.valueCodeableConcept.coding?.[0]?.display || "—";
  if (o?.valueString) return o.valueString;
  if (o?.component?.length) {
    return o.component
      .map((c: any) => {
        const label = c.code?.coding?.[0]?.display || c.code?.text || "";
        const val = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit || ""}`.trim() : "—";
        return label ? `${label}: ${val}` : val;
      })
      .join(" · ");
  }
  return "—";
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

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconMapPin({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  );
}
function IconPhone({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.94 12.94 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.94 12.94 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
  );
}
function IconHeart({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  );
}
function IconThermometer({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
  );
}
function IconWind({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>
  );
}
function IconDroplet({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
  );
}
function IconScale({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16l4-4"/><path d="M20 16l-4-4"/><path d="M12 12a4 4 0 0 0-4 4v2h8v-2a4 4 0 0 0-4-4z"/><path d="M12 2v10"/><path d="M8 12h8"/></svg>
  );
}
function IconRuler({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>
  );
}
function IconUser({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  );
}
function IconAlert({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  );
}

// ── Patient Card ──────────────────────────────────────────────────────────────

function PatientCard({ patient }: { patient: any }) {
  const philhealth = idVal(patient, "philhealth");
  const philsys = idVal(patient, "philsys");
  const age = patient.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const contact = firstPhone(patient.telecom);
  const address = formatAddress(patient.address);

  const gender = (patient.gender || "").toLowerCase();
  const genderClass = gender === "male" ? "gender-m" : gender === "female" ? "gender-f" : "";

  const initials = humanName(patient.name)
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="patient-card-v2">
      <div className="patient-row">
        <div className={`patient-avatar-v2 ${genderClass}`}>{initials}</div>
        <div className="patient-info">
          <div className="patient-name-v2">{humanName(patient.name)}</div>
          <div className="patient-badges">
            {patient.gender && <span className="pb">{patient.gender}</span>}
            {age !== null && <span className="pb">{age} yrs</span>}
            {patient.birthDate && (
              <span className="pb">Born {new Date(patient.birthDate).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

      <div className="patient-grid">
        <div className="pg-cell">
          <span className="pg-label">PhilHealth</span>
          <span className={`pg-value ${!philhealth ? "muted" : ""}`}>{philhealth || "Not provided"}</span>
        </div>
        <div className="pg-cell">
          <span className="pg-label">PhilSys</span>
          <span className={`pg-value ${!philsys ? "muted" : ""}`}>{philsys || "Not provided"}</span>
        </div>
        <div className="pg-cell">
          <span className="pg-label">Address</span>
          <span className={`pg-value ${!address ? "muted" : ""}`}>{address || "Not provided"}</span>
        </div>
        <div className="pg-cell">
          <span className="pg-label">Contact</span>
          <span className={`pg-value ${!contact ? "muted" : ""}`}>{contact || "Not provided"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Vitals Panel ──────────────────────────────────────────────────────────────

type VitalItem = {
  id: string;
  name: string;
  value: string;
  unit: string;
  date: string;
  icon: React.ReactNode;
  colorClass: string;
};

function VitalsPanel({ observations }: { observations: any[] }) {
  const LOINC_NAMES: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
    "8867-4": { name: "Heart Rate", icon: <IconHeart />, color: "vital-rose" },
    "8310-5": { name: "Temperature", icon: <IconThermometer />, color: "vital-amber" },
    "9279-1": { name: "Respiratory Rate", icon: <IconWind />, color: "vital-teal" },
    "2708-6": { name: "SpO₂", icon: <IconDroplet />, color: "vital-sky" },
    "59408-5": { name: "SpO₂", icon: <IconDroplet />, color: "vital-sky" },
    "29463-7": { name: "Weight", icon: <IconScale />, color: "vital-slate" },
    "8302-2": { name: "Height", icon: <IconRuler />, color: "vital-slate" },
    "39156-5": { name: "BMI", icon: <IconScale />, color: "vital-slate" },
  };

  function getCode(o: any): string | undefined {
    return o.code?.coding?.find((c: any) => c.system?.includes("loinc.org"))?.code;
  }

  function hasBPComponent(o: any): boolean {
    return (o.component || []).some((c: any) => {
      const code = c.code?.coding?.find((coding: any) => coding.system?.includes("loinc.org"))?.code;
      return code === "8480-6" || code === "8462-4";
    });
  }

  function fmtValue(o: any): string {
    if (o.valueQuantity) return `${o.valueQuantity.value} ${o.valueQuantity.unit || ""}`.trim();
    if (o.valueCodeableConcept) return o.valueCodeableConcept.text || o.valueCodeableConcept.coding?.[0]?.display || "—";
    if (o.valueString) return o.valueString;
    return "—";
  }

  function fmtValueParts(o: any): { value: string; unit: string } {
    if (o.valueQuantity) {
      return { value: String(o.valueQuantity.value), unit: o.valueQuantity.unit || "" };
    }
    return { value: fmtValue(o), unit: "" };
  }

  function fmtTableValue(o: any): React.ReactNode {
    if (!o.component?.length) return fmtValue(o);
    const parts = o.component.map((c: any, idx: number) => {
      const code = c.code?.coding?.find((coding: any) => coding.system?.includes("loinc.org"))?.code;
      const label = code === "8480-6" ? "Systolic" : code === "8462-4" ? "Diastolic" : c.code?.coding?.[0]?.display || c.code?.text || "";
      const val = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit || ""}`.trim() : "—";
      return (
        <span key={idx}>
          {idx > 0 && <span className="obs-sep"> · </span>}
          {label} <strong>{val}</strong>
        </span>
      );
    });
    return <>{parts}</>;
  }

  function fmtCardDate(o: any): string {
    const d = o.effectiveDateTime ? new Date(o.effectiveDateTime) : o.issued ? new Date(o.issued) : null;
    if (!d) return "";
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const y = String(d.getFullYear()).slice(-2);
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${m}/${day}/${y} · ${h12}:${minutes} ${ampm}`;
  }

  function fmtTableDate(o: any): string {
    const d = o.effectiveDateTime ? new Date(o.effectiveDateTime) : o.issued ? new Date(o.issued) : null;
    if (!d) return "";
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const y = d.getFullYear();
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${m}/${day}/${y} · ${h12}:${minutes} ${ampm}`;
  }

  const known: VitalItem[] = [];
  const others: any[] = [];

  for (const o of observations) {
    const code = getCode(o);
    const isBP = code === "8480-6" || code === "8462-4" || code === "85354-9" || hasBPComponent(o);
    if (isBP || !code) {
      others.push(o);
      continue;
    }

    const meta = LOINC_NAMES[code];
    if (meta) {
      const parts = fmtValueParts(o);
      known.push({
        id: o.id,
        name: meta.name,
        value: parts.value,
        unit: parts.unit,
        date: fmtCardDate(o),
        icon: meta.icon,
        colorClass: meta.color,
      });
    } else {
      others.push(o);
    }
  }

  return (
    <div className="vitals-panel-v2">
      {known.length > 0 && (
        <div className="vitals-grid">
          {known.map((v) => (
            <div key={v.id} className={`vital-card ${v.colorClass}`}>
              <div className="vital-card-top">
                <span className="vital-icon">{v.icon}</span>
                <span className="vital-name">{v.name}</span>
              </div>
              <div className="vital-card-value">
                {v.value}
                {v.unit && <span className="vital-unit">{v.unit}</span>}
              </div>
              {v.date && <div className="vital-card-date">{v.date}</div>}
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="other-obs-v2">
          <div className="other-obs-title">Other Observations</div>
          <table className="obs-table">
            <thead>
              <tr>
                <th>Observation</th>
                <th>Value</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {others.map((o) => (
                <tr key={o.id}>
                  <td>{o.code?.coding?.[0]?.display || o.code?.text || "Observation"}</td>
                  <td>{fmtTableValue(o)}</td>
                  <td>{fmtTableDate(o) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, resource, fhirBadge, count, children }: { title: string; resource?: string; fhirBadge?: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="section-header">
        <div className="section-title-wrap">
          <span className="section-indicator" />
          <h2 className="section-title">{title}</h2>
          {count !== undefined && <span className="section-count">{count}</span>}
        </div>
        {fhirBadge && (
          <span className="section-fhir-badge">
            FHIR <span className="section-fhir-dot">·</span> {fhirBadge}
          </span>
        )}
      </div>
      {resource && (
        <p className="muted" style={{ marginTop: -10, marginBottom: 12, fontSize: 12 }}>
          FHIR Resource: <code>{resource}</code>
        </p>
      )}
      {children}
    </div>
  );
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

  const availableActions = (s: string) => {
    switch (s) {
      case "requested":
        return [
          { label: "Mark Received", status: "received", variant: "primary" as const },
          { label: "Reject", status: "rejected", variant: "danger" as const, note: true },
        ];
      case "received":
        return [{ label: "Accept", status: "accepted", variant: "primary" as const }];
      case "accepted":
        return [{ label: "Complete", status: "completed", variant: "primary" as const, note: true }];
      default:
        return [];
    }
  };
  const actions = availableActions(status);

  async function retrieve() {
    setLoading(true); setError(null);
    try {
      // Step 1: Fetch ServiceRequest with basic includes. The requester/performer
      // may be PractitionerRoles, so iterate-include their Organization too.
      const bundle = await fhirGet(
        `ServiceRequest?_id=${sr.id}` +
        `&_include=ServiceRequest:subject` +
        `&_include=ServiceRequest:requester` +
        `&_include=ServiceRequest:performer` +
        `&_include:iterate=PractitionerRole:organization` +
        `&_revinclude=Task:focus` +
        `&_revinclude=Provenance:target`
      );

      const all = dedupeResources(bundle);
      const orgs = all.filter((r) => r.resourceType === "Organization");
      const roles = all.filter((r) => r.resourceType === "PractitionerRole");
      const provenances = all.filter((r) => r.resourceType === "Provenance");

      // Resolve an Organization from a reference that may point either directly at
      // an Organization or at a PractitionerRole that carries an organization link.
      const resolveOrg = (ref: string): any | null => {
        const id = refId(ref);
        if (!id) return null;
        const direct = orgs.find((o) => o.id === id);
        if (direct) return direct;
        const role = roles.find((r) => r.id === id);
        const orgId = refId(role?.organization?.reference || "");
        return orgs.find((o) => o.id === orgId) || null;
      };

      // Use the most recently updated provenance
      const latestProvenance = provenances.sort((a, b) =>
        new Date(b.meta?.lastUpdated || 0).getTime() - new Date(a.meta?.lastUpdated || 0).getTime()
      )[0] || null;

      const patient = all.find((r) => r.resourceType === "Patient") || null;
      const task = all.find((r) => r.resourceType === "Task") || null;

      // Step 2: Fetch encounter (and any Observations the server returns via revinclude)
      let encounter = null;
      const obsById = new Map<string, any>();
      if (sr.encounter?.reference) {
        const encounterId = sr.encounter.reference.split('/').pop();
        const encounterBundle = await fhirGet(`Encounter?_id=${encounterId}&_revinclude=Observation:encounter`);
        encounter = encounterBundle.entry?.find((e: any) => e.resource?.resourceType === "Encounter")?.resource || null;
        for (const e of encounterBundle.entry || []) {
          if (e.resource?.resourceType === "Observation") obsById.set(e.resource.id, e.resource);
        }
      }

      // Step 2b: Fetch Observations by patient (reliable — vitals are linked by subject
      // even when the server does not honour the Encounter:encounter _revinclude).
      if (patient) {
        const obsBundle = await fhirGet(`Observation?subject=Patient/${patient.id}`);
        for (const e of obsBundle.entry || []) {
          if (e.resource?.resourceType === "Observation") obsById.set(e.resource.id, e.resource);
        }
      }
      const observations = Array.from(obsById.values());

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
        requesterOrg: resolveOrg(sr.requester?.reference || ""),
        performerOrg: resolveOrg(sr.performer?.[0]?.reference || ""),
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
      <div className="incoming-header" style={{ padding: "16px 22px", marginBottom: 16 }}>
        <div className="incoming-header-top">
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button className="ghost" onClick={onBack} style={{ color: "#fff", borderColor: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.1)" }}>
              ← Back to list
            </button>
            <div>
              <h1 className="incoming-header-title" style={{ fontSize: 18, margin: 0 }}>
                Referral {displayId}
              </h1>
            </div>
            <span className={`badge ${status}`} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999 }}>{status}</span>
          </div>
          <div className="incoming-header-actions">
            {activeTask && actions.map((a) => (
              <button
                key={a.status}
                className={a.variant === "danger" ? "action-danger" : a.variant === "primary" ? "action-primary" : ""}
                onClick={() => applyAction(a.status, a.note)}
                disabled={!!busy}
              >
                {busy === a.status ? "…" : a.label}
              </button>
            ))}
            <button onClick={retrieve} disabled={loading}>
              {loading ? "Retrieving…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {notice && <div className="alert ok">✅ {notice}</div>}
      {error && <div className="alert err">❌ {error}</div>}
      {loading && <p className="muted">Loading referral details…</p>}

      {detail && (
        <>
          {/* Referral summary */}
          <Section title="Referral summary" resource="ServiceRequest">
            <dl className="kv">
              <dt>Referral ID</dt>
              <dd>{sr.requisition?.value || sr.identifier?.[0]?.value || sr.id}</dd>
              <dt>Status</dt>
              <dd><span className={`badge ${status}`}>{status}</span></dd>
              <dt>Intent</dt>
              <dd>{sr.intent || "—"}</dd>
              <dt>Priority</dt>
              <dd>{sr.priority || "—"}</dd>
              <dt>Referral Category</dt>
              <dd>{sr.category?.[0]?.coding?.[0]?.display || sr.category?.[0]?.text || "—"}</dd>
              <dt>Reason for Referral (Service Type)</dt>
              <dd>{sr.reasonCode?.[0]?.coding?.[0]?.display || sr.reasonCode?.[0]?.text || "—"}</dd>
              <dt>Clinical Reason</dt>
              <dd>{sr.reasonCode?.[0]?.text || "—"}</dd>
              <dt>Date of Referral</dt>
              <dd>{sr.authoredOn ? new Date(sr.authoredOn).toLocaleString() : "—"}</dd>
              <dt>Occurrence</dt>
              <dd>{sr.occurrenceDateTime
                ? new Date(sr.occurrenceDateTime).toLocaleString()
                : sr.occurrencePeriod?.start
                ? new Date(sr.occurrencePeriod.start).toLocaleString()
                : "—"}</dd>
              <dt>Notes</dt>
              <dd>{sr.note?.[0]?.text || "—"}</dd>
            </dl>
          </Section>

          {/* Facilities */}
          <Section title="Facilities" resource="Organization (via ServiceRequest.requester / ServiceRequest.performer)">
            <div className="grid two">
              <dl className="kv" style={{ margin: 0 }}>
                <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}>
                  Initiating (Requester)
                </dt>
                <dt>Name</dt>
                <dd>{detail.requesterOrg?.name || refId(sr.requester?.reference || "") || "—"}</dd>
                <dt>NHFR</dt>
                <dd>{idVal(detail.requesterOrg, "nhfr") || "—"}</dd>
                <dt>HCPN</dt>
                <dd>{idVal(detail.requesterOrg, "hcpn") || "—"}</dd>
                <dt>Address</dt>
                <dd>{formatAddress(detail.requesterOrg?.address) || "—"}</dd>
                <dt>Contact Number</dt>
                <dd>{firstPhone(detail.requesterOrg?.telecom) || "—"}</dd>
              </dl>
              <dl className="kv" style={{ margin: 0 }}>
                <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}>
                  Receiving (Performer)
                </dt>
                <dt>Name</dt>
                <dd>{detail.performerOrg?.name || refId(sr.performer?.[0]?.reference || "") || "—"}</dd>
                <dt>NHFR</dt>
                <dd>{idVal(detail.performerOrg, "nhfr") || "—"}</dd>
                <dt>HCPN</dt>
                <dd>{idVal(detail.performerOrg, "hcpn") || "—"}</dd>
                <dt>Address</dt>
                <dd>{formatAddress(detail.performerOrg?.address) || "—"}</dd>
                <dt>Contact Number</dt>
                <dd>{firstPhone(detail.performerOrg?.telecom) || "—"}</dd>
              </dl>
            </div>
          </Section>

          {/* Patient */}
          <Section title="Patient" fhirBadge="Patient">
            {detail.patient ? <PatientCard patient={detail.patient} /> : <p className="muted">No patient data available.</p>}
          </Section>

          {/* Provenance */}
          <Section title="Provenance" resource="Provenance">
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
            <Section title="Encounter" resource="Encounter">
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
          <Section title="Vitals & Observations" fhirBadge="Observation" count={detail.observations.length}>
            {detail.observations.length > 0
              ? <VitalsPanel observations={detail.observations} />
              : <p className="muted">No vital signs or observations recorded.</p>}
          </Section>

          {/* Conditions */}
          <Section title={`Conditions / Diagnoses (${detail.conditions.length})`} resource="Condition">
            {detail.conditions.length > 0 ? detail.conditions.map((c, idx) => (
                <div key={c.id || idx} style={{ marginBottom: idx < detail.conditions.length - 1 ? 12 : 0, paddingBottom: idx < detail.conditions.length - 1 ? 12 : 0, borderBottom: idx < detail.conditions.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <dl className="kv">
                    <dt>Code</dt>
                    <dd>{c.code?.coding?.[0]?.display || c.code?.text || "—"}</dd>
                    <dt>Category</dt>
                    <dd>{c.category?.[0]?.coding?.[0]?.display || c.category?.[0]?.text || "—"}</dd>
                    <dt>Clinical Status</dt>
                    <dd>{c.clinicalStatus?.coding?.[0]?.display || c.clinicalStatus?.coding?.[0]?.code || "—"}</dd>
                    <dt>Verification Status</dt>
                    <dd>{c.verificationStatus?.coding?.[0]?.display || c.verificationStatus?.coding?.[0]?.code || "—"}</dd>
                    <dt>Notes</dt>
                    <dd>{c.note?.[0]?.text || "—"}</dd>
                  </dl>
                </div>
              )) : <p className="muted">No conditions / diagnoses recorded.</p>}
          </Section>

          {/* Procedures */}
          <Section title={`Procedures / Treatment (${detail.procedures.length})`} resource="Procedure">
            {detail.procedures.length > 0 ? detail.procedures.map((p, idx) => (
                <div key={p.id || idx} style={{ marginBottom: idx < detail.procedures.length - 1 ? 12 : 0, paddingBottom: idx < detail.procedures.length - 1 ? 12 : 0, borderBottom: idx < detail.procedures.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <dl className="kv">
                    <dt>Code</dt>
                    <dd>{p.code?.coding?.[0]?.display || p.code?.text || "—"}</dd>
                    <dt>Status</dt>
                    <dd>{p.status || "—"}</dd>
                    <dt>Performed</dt>
                    <dd>{p.performedDateTime
                      ? new Date(p.performedDateTime).toLocaleString()
                      : p.performedPeriod?.start
                      ? new Date(p.performedPeriod.start).toLocaleString()
                      : "—"}</dd>
                    <dt>Notes (Treatment Given)</dt>
                    <dd>{p.note?.[0]?.text || "—"}</dd>
                  </dl>
                </div>
              )) : <p className="muted">No procedures / treatment recorded.</p>}
          </Section>

          {/* Diagnostic Reports */}
          <Section title={`Diagnostic Reports / Lab Results (${detail.diagnosticReports.length})`} resource="DiagnosticReport">
            {detail.diagnosticReports.length > 0 ? detail.diagnosticReports.map((dr, idx) => (
                <div key={dr.id || idx} style={{ marginBottom: idx < detail.diagnosticReports.length - 1 ? 12 : 0, paddingBottom: idx < detail.diagnosticReports.length - 1 ? 12 : 0, borderBottom: idx < detail.diagnosticReports.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <dl className="kv">
                    <dt>Code</dt>
                    <dd>{dr.code?.coding?.[0]?.display || dr.code?.text || "—"}</dd>
                    <dt>Status</dt>
                    <dd>{dr.status || "—"}</dd>
                    <dt>Title</dt>
                    <dd>{dr.presentedForm?.[0]?.title || "—"}</dd>
                    <dt>Conclusion</dt>
                    <dd>{dr.conclusion || "—"}</dd>
                  </dl>
                </div>
              )) : <p className="muted">No diagnostic reports / lab results recorded.</p>}
          </Section>
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
        <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Incoming Referrals" }]} title="Incoming Referrals" />
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
        <AppPageHeader
          items={[
            { label: "Home", href: "/" },
            { label: "Incoming Referrals", href: "/referrals/incoming" },
            { label: selected.sr?.identifier?.[0]?.value || selected.sr?.id },
          ]}
          title={`Referral: ${selected.sr?.identifier?.[0]?.value || selected.sr?.id || "Detail"}`}
        />
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
      <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Incoming Referrals" }]} title="Incoming Referrals" />

      {/* Redesigned header */}
      <div className="incoming-header">
        <div className="incoming-header-top">
          <div>
            <h1 className="incoming-header-title">Incoming Referrals</h1>
            <p className="incoming-header-sub">
              Referrals where your organization is the performer{" "}
              <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
                ServiceRequest.performer = Organization/{orgId}
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
