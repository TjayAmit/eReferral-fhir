"use client";

import { useEffect, useState } from "react";
import { fhirGet, fhirPost, FhirError } from "@/lib/fhir";
import { buildNextTask, latestTask, humanName, formatAddress, firstPhone } from "@/lib/referral";
import TaskHistory from "./TaskHistory";
import Modal from "./Modal";

// ── types ─────────────────────────────────────────────────────────────────────

type DetailData = {
  patient: any | null;
  requesterOrg: any | null;
  requesterRole: any | null;
  requesterPractitioner: any | null;
  performerOrg: any | null;
  performerRole: any | null;
  performerPractitioner: any | null;
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

function firstEmail(t?: any[]): string {
  return (t || []).find((x) => x.system === "email")?.value || "—";
}

function specialtyText(role?: any): string {
  const s = role?.specialty?.[0]?.coding?.[0];
  return s?.display || s?.code || "—";
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

// ── Icons ──────────────────────────────────────────────────────────────────────

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

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "#6b7280", fontSize: 12, minWidth: 80, fontWeight: 500 }}>PhilHealth</span>
          <span style={{ fontSize: 13, color: "#111827" }}>{philhealth || "Not provided"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "#6b7280", fontSize: 12, minWidth: 80, fontWeight: 500 }}>PhilSys</span>
          <span style={{ fontSize: 13, color: "#111827" }}>{philsys || "Not provided"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "#6b7280", fontSize: 12, minWidth: 80, fontWeight: 500 }}>Address</span>
          <span style={{ fontSize: 13, color: "#111827" }}>{address || "Not provided"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "#6b7280", fontSize: 12, minWidth: 80, fontWeight: 500 }}>Contact</span>
          <span style={{ fontSize: 13, color: "#111827" }}>{contact || "Not provided"}</span>
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

  // Group observations by date (day-level) and keep only the latest group
  function dateKey(o: any): string {
    const d = o.effectiveDateTime ? new Date(o.effectiveDateTime) : o.issued ? new Date(o.issued) : null;
    if (!d) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const grouped = new Map<string, any[]>();
  for (const o of observations) {
    const k = dateKey(o);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(o);
  }
  const latestDate = Array.from(grouped.keys()).sort().pop() || "";
  const latestObs = latestDate ? grouped.get(latestDate)! : observations;

  const known: VitalItem[] = [];
  const others: any[] = [];

  for (const o of latestObs) {
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

// ── Clinical Panel (maps FHIR Conditions/Procedures to form labels) ─────────

type ClinicalItem = {
  label: string;
  ref: string;
  value: string;
  sub?: string;
  badge?: string;
  type: "complaint" | "history" | "impression" | "treatment";
};

function ClinicalPanel({ conditions, procedures }: { conditions: any[]; procedures: any[] }) {
  // Identify clinical concepts from the submit form mapping
  const chief = conditions.find((c) =>
    c.category?.some((cat: any) => cat.coding?.some((coding: any) => coding.code === "problem-list-item"))
  );
  const impression = conditions.find((c) =>
    c.category?.some((cat: any) => cat.coding?.some((coding: any) => coding.code === "encounter-diagnosis"))
  );
  // Treatment Given is stored in Procedure note (code = Drug therapy)
  const treatmentProc = procedures.find((p) =>
    p.code?.coding?.some((c: any) => c.code === "416608005" || c.display?.toLowerCase().includes("drug"))
  ) || procedures[0];

  const items: ClinicalItem[] = [];

  if (chief) {
    items.push({
      label: "Chief Complaint",
      ref: "REF-31",
      value: chief.code?.text || chief.code?.coding?.[0]?.display || "—",
      sub: chief.note?.[0]?.text || undefined,
      type: "complaint",
    });
  }

  // Clinical history may be on either condition; prefer chief complaint's note if present
  const history = chief?.note?.[0]?.text || impression?.note?.[0]?.text;
  if (history) {
    items.push({
      label: "Clinical History",
      ref: "REF-32",
      value: history,
      type: "history",
    });
  }

  if (impression) {
    const codeText = impression.code?.text;
    const codeDisp = impression.code?.coding?.[0]?.display;
    const codeCode = impression.code?.coding?.[0]?.code;
    const value = codeText || (codeDisp && codeCode ? `${codeDisp} (${codeCode})` : codeDisp || "—");
    items.push({
      label: "Working Impression",
      ref: "REF-41",
      value,
      badge: impression.verificationStatus?.coding?.[0]?.display || impression.verificationStatus?.coding?.[0]?.code || "provisional",
      type: "impression",
    });
  }

  if (treatmentProc?.note?.[0]?.text) {
    items.push({
      label: "Treatment Given",
      ref: "REF-39",
      value: treatmentProc.note[0].text,
      type: "treatment",
    });
  }

  if (items.length === 0) {
    return <p className="muted">No clinical summary recorded.</p>;
  }

  return (
    <div className="clinical-panel">
      {items.map((item, idx) => (
        <div key={idx} className={`clinical-card clinical-${item.type}`}>
          <div className="clinical-hd">
            <span className="clinical-label">{item.label}</span>
            <span className="clinical-ref">{item.ref}</span>
            {item.badge && <span className="clinical-badge">{item.badge}</span>}
          </div>
          <div className="clinical-body">
            <div className="clinical-value">{item.value}</div>
            {item.sub && <div className="clinical-sub">{item.sub}</div>}
          </div>
        </div>
      ))}
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

// ── Referral detail view ────────────────────────────────────────────────────

export default function ReferralDetailView({
  sr, task: taskProp, onBack, onChanged, showActions = true, defaultTab = "referral",
}: { sr: any; task?: any | null; onBack?: () => void; onChanged?: (t: any) => void; showActions?: boolean; defaultTab?: "referral" | "clinical" }) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"referral" | "clinical">(defaultTab);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

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
      // Step 1: Fetch the ServiceRequest together with the resources it directly
      // references — subject (Patient), requester (Referring), performer (Receiving
      // Organization) and encounter. The requester/performer may be PractitionerRoles,
      // so iterate-include their Organization and Practitioner too. Task and Provenance
      // come along via rev/forward includes.
      const bundle = await fhirGet(
        `ServiceRequest?_id=${sr.id}` +
        `&_include=ServiceRequest:subject` +
        `&_include=ServiceRequest:requester` +
        `&_include=ServiceRequest:performer` +
        `&_include=ServiceRequest:encounter` +
        `&_include:iterate=PractitionerRole:organization` +
        `&_include:iterate=PractitionerRole:practitioner`
      );

      const all = dedupeResources(bundle);
      const orgs = all.filter((r) => r.resourceType === "Organization");
      const roles = all.filter((r) => r.resourceType === "PractitionerRole");
      const practitioners = all.filter((r) => r.resourceType === "Practitioner");

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

      // Resolve a PractitionerRole from a ServiceRequest requester/performer reference.
      const resolveRole = (ref: string): any | null => {
        const id = refId(ref);
        if (!id) return null;
        return roles.find((r) => r.id === id) || null;
      };

      // Resolve a Practitioner from a PractitionerRole practitioner reference.
      const resolvePractitioner = (roleRef: string): any | null => {
        const role = resolveRole(roleRef);
        if (!role) return null;
        const practId = refId(role.practitioner?.reference || "");
        return practitioners.find((p) => p.id === practId) || null;
      };

      const patient = all.find((r) => r.resourceType === "Patient") || null;

      const collect = (b: any, rt: string): any[] =>
        (b?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === rt);

      // Fetch Task and Provenance separately (removed from main query to avoid HAPI hang)
      let task = taskProp || null;
      if (!task) {
        try {
          const taskBundle = await fhirGet(`Task?focus=ServiceRequest/${sr.id}&_sort=-_lastUpdated&_count=1`);
          const tasks = collect(taskBundle, "Task");
          task = latestTask(tasks);
        } catch {
          /* ignore task fetch errors */
        }
      }

      let latestProvenance: any = null;
      try {
        const provBundle = await fhirGet(`Provenance?target=ServiceRequest/${sr.id}&_sort=-_lastUpdated&_count=1`);
        const provs = collect(provBundle, "Provenance");
        latestProvenance = provs[0] || null;
      } catch {
        /* ignore provenance fetch errors */
      }

      // The encounter was included with the ServiceRequest in step 1.
      const encounter = all.find((r) => r.resourceType === "Encounter") || null;
      const encounterId = encounter?.id || refId(sr.encounter?.reference || "");

      // Step 2: Use the Encounter to gather everything recorded during the visit —
      // Observations, Conditions, Procedures and DiagnosticReports are linked to it.
      let observations: any[] = [];
      let conditions: any[] = [];
      let procedures: any[] = [];
      let diagnosticReports: any[] = [];
      if (encounterId) {
        const enc = `Encounter/${encounterId}`;
        const [obsB, condB, procB, drB] = await Promise.all([
          fhirGet(`Observation?encounter=${enc}&_count=100`),
          fhirGet(`Condition?encounter=${enc}&_count=100`),
          fhirGet(`Procedure?encounter=${enc}&_count=100`),
          fhirGet(`DiagnosticReport?encounter=${enc}&_count=100`),
        ]);
        observations = (obsB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Observation");
        conditions = (condB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Condition");
        procedures = (procB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Procedure");
        diagnosticReports = (drB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "DiagnosticReport");
      }

      // Fallback: older referrals whose clinical resources aren't linked to an
      // Encounter — fetch by Patient subject so the view still renders.
      const nothingFromEncounter =
        observations.length + conditions.length + procedures.length + diagnosticReports.length === 0;
      if (patient && (!encounterId || nothingFromEncounter)) {
        const subj = `Patient/${patient.id}`;
        const [obsB, condB, procB, drB] = await Promise.all([
          fhirGet(`Observation?subject=${subj}&_count=100`),
          fhirGet(`Condition?subject=${subj}&_count=100`),
          fhirGet(`Procedure?subject=${subj}&_count=100`),
          fhirGet(`DiagnosticReport?subject=${subj}&_count=100`),
        ]);
        if (observations.length === 0) observations = (obsB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Observation");
        if (conditions.length === 0) conditions = (condB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Condition");
        if (procedures.length === 0) procedures = (procB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Procedure");
        if (diagnosticReports.length === 0) diagnosticReports = (drB?.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "DiagnosticReport");
      }

      // Receiving side: ServiceRequest.performer = Organization only;
      // the receiving PractitionerRole / Practitioner are in Task.owner
      let performerRoleFromTask = task?.owner ? resolveRole(task.owner.reference || "") : null;
      let performerPractFromTask = task?.owner ? resolvePractitioner(task.owner.reference || "") : null;
      let performerOrgFromTask = task?.owner
        ? resolveOrg(task.owner.reference || "")
        : resolveOrg(sr.performer?.[0]?.reference || "");

      // Fallback: if _include:iterate didn't bring the receiving practitioner,
      // explicitly fetch the Task.owner role + linked org + practitioner.
      if (task?.owner?.reference?.includes("PractitionerRole") && !performerPractFromTask) {
        try {
          const roleId = refId(task.owner.reference);
          const role = await fhirGet(`PractitionerRole/${roleId}`);
          if (role) {
            performerRoleFromTask = role;
            const orgId = refId(role.organization?.reference || "");
            const practId = refId(role.practitioner?.reference || "");
            const [org, pract] = await Promise.all([
              orgId ? fhirGet(`Organization/${orgId}`).catch(() => null) : Promise.resolve(null),
              practId ? fhirGet(`Practitioner/${practId}`).catch(() => null) : Promise.resolve(null),
            ]);
            if (org) performerOrgFromTask = org;
            if (pract) performerPractFromTask = pract;
          }
        } catch {
          /* ignore fallback errors */
        }
      }

      // Prefer ServiceRequest.requester; fall back to Task.requester for newly-submitted referrals
      const reqRef = sr.requester?.reference || task?.requester?.reference || "";
      const detailData = {
        patient,
        requesterOrg: resolveOrg(reqRef),
        requesterRole: resolveRole(reqRef),
        requesterPractitioner: resolvePractitioner(reqRef),
        performerOrg: performerOrgFromTask || resolveOrg(sr.performer?.[0]?.reference || ""),
        performerRole: performerRoleFromTask,
        performerPractitioner: performerPractFromTask,
        task,
        provenance: latestProvenance,
        encounter,
        observations,
        conditions,
        procedures,
        diagnosticReports,
      };
      setDetail(detailData);
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { retrieve(); }, [sr?.id]);

  function openNoteModal(s: string) {
    setPendingAction(s);
    setNoteText("");
    setNoteModalOpen(true);
  }

  async function confirmAction() {
    if (!activeTask || !pendingAction) return;
    const s = pendingAction;
    const reason = noteText.trim() || undefined;
    setNoteModalOpen(false);
    setBusy(s); setNotice(null); setError(null);
    try {
      const newTask = buildNextTask(activeTask, s, reason);
      const updated = await fhirPost("Task", newTask);
      setNotice(`Action point updated → ${s}`);
      onChanged?.(updated);
      retrieve();
    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally { setBusy(null); setPendingAction(null); }
  }

  async function applyAction(s: string, needsNote?: boolean) {
    if (!activeTask) return;
    if (needsNote) {
      openNoteModal(s);
      return;
    }
    setBusy(s); setNotice(null); setError(null);
    try {
      const newTask = buildNextTask(activeTask, s, undefined);
      const updated = await fhirPost("Task", newTask);
      setNotice(`Action point updated → ${s}`);
      onChanged?.(updated);
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
            {onBack && (
              <button className="ghost" onClick={onBack} style={{ color: "#fff", borderColor: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.1)" }}>
                ← Back to list
              </button>
            )}
            <div>
              <h1 className="incoming-header-title" style={{ fontSize: 18, margin: 0 }}>
                Referral {displayId}
              </h1>
            </div>
            <span className={`badge ${status}`} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999 }}>{status}</span>
          </div>
          <div className="incoming-header-actions">
            {showActions && activeTask && actions.map((a) => (
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

      <Modal
        isOpen={noteModalOpen}
        onClose={() => { setNoteModalOpen(false); setPendingAction(null); }}
        title={pendingAction === "rejected" ? "Reason for Rejection" : pendingAction === "completed" ? "Completion Notes" : "Add Note"}
      >
        <p className="muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          {pendingAction === "rejected"
            ? "Describe why this referral is being rejected."
            : "Describe the patient's current status and outcome."}
        </p>
        <div className="field">
          <label htmlFor="action-note">
            {pendingAction === "rejected" ? "Reason for rejection" : "Completion notes"}
          </label>
          <textarea
            id="action-note"
            rows={3}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={pendingAction === "rejected" ? "Enter reason for rejecting this referral…" : "Enter completion notes…"}
            autoFocus
          />
        </div>
        <div className="modal-footer" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="ghost" onClick={() => { setNoteModalOpen(false); setPendingAction(null); }}>
            Cancel
          </button>
          <button type="button" onClick={confirmAction} disabled={!!busy || (pendingAction === "rejected" && !noteText.trim())}>
            {busy ? "Submitting…" : "Confirm"}
          </button>
        </div>
      </Modal>

      {notice && <div className="alert ok">✅ {notice}</div>}
      {error && <div className="alert err">❌ {error}</div>}
      {loading && <p className="muted">Loading referral details…</p>}

      {detail && (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 16 }}>
            <button
              onClick={() => setActiveTab("clinical")}
              style={{
                padding: "10px 20px",
                border: "none",
                borderBottom: activeTab === "clinical" ? "2px solid #2563eb" : "2px solid transparent",
                background: "transparent",
                color: activeTab === "clinical" ? "#2563eb" : "#6b7280",
                fontWeight: activeTab === "clinical" ? 600 : 400,
                fontSize: 14,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              Clinical Details
            </button>
            <button
              onClick={() => setActiveTab("referral")}
              style={{
                padding: "10px 20px",
                border: "none",
                borderBottom: activeTab === "referral" ? "2px solid #2563eb" : "2px solid transparent",
                background: "transparent",
                color: activeTab === "referral" ? "#2563eb" : "#6b7280",
                fontWeight: activeTab === "referral" ? 600 : 400,
                fontSize: 14,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              Referral Details
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
            <div>
              {activeTab === "referral" && (
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

                  {/* Facilities & Practitioners */}
                  <Section title="Facilities & Practitioners" resource="Organization / PractitionerRole / Practitioner">
                    <div className="grid two">
                      <dl className="kv" style={{ margin: 0 }}>
                        <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}>
                          Initiating (Requester)
                        </dt>
                        <dt>Organization</dt>
                        <dd>{detail.requesterOrg?.name || refId(sr.requester?.reference || "") || "—"}</dd>
                        <dt>NHFR</dt>
                        <dd>{idVal(detail.requesterOrg, "nhfr") || "—"}</dd>
                        <dt>HCPN</dt>
                        <dd>{idVal(detail.requesterOrg, "hcpn") || "—"}</dd>
                        <dt>Address</dt>
                        <dd>{formatAddress(detail.requesterOrg?.address) || "—"}</dd>
                        <dt>Contact Number</dt>
                        <dd>{firstPhone(detail.requesterOrg?.telecom) || "—"}</dd>
                        <dt>Email</dt>
                        <dd>{firstEmail(detail.requesterOrg?.telecom) || "—"}</dd>
                        <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginTop: 8, marginBottom: 4, borderTop: "1px solid #e0e0e0", paddingTop: 8 }}>
                          Referring Practitioner
                        </dt>
                        <dt>Name</dt>
                        <dd>{humanName(detail.requesterPractitioner?.name) || "—"}</dd>
                        <dt>Role</dt>
                        <dd>{detail.requesterRole?.code?.[0]?.coding?.[0]?.display || detail.requesterRole?.code?.[0]?.text || "—"}</dd>
                        <dt>Specialty</dt>
                        <dd>{specialtyText(detail.requesterRole)}</dd>
                        <dt>PRC</dt>
                        <dd>{idVal(detail.requesterPractitioner, "prc") || "—"}</dd>
                      </dl>
                      <dl className="kv" style={{ margin: 0 }}>
                        <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}>
                          Receiving (Performer)
                        </dt>
                        <dt>Organization</dt>
                        <dd>{detail.performerOrg?.name || refId(sr.performer?.[0]?.reference || "") || "—"}</dd>
                        <dt>NHFR</dt>
                        <dd>{idVal(detail.performerOrg, "nhfr") || "—"}</dd>
                        <dt>HCPN</dt>
                        <dd>{idVal(detail.performerOrg, "hcpn") || "—"}</dd>
                        <dt>Address</dt>
                        <dd>{formatAddress(detail.performerOrg?.address) || "—"}</dd>
                        <dt>Contact Number</dt>
                        <dd>{firstPhone(detail.performerOrg?.telecom) || "—"}</dd>
                        <dt>Email</dt>
                        <dd>{firstEmail(detail.performerOrg?.telecom) || "—"}</dd>
                        <dt style={{ gridColumn: "1/-1", color: "var(--ink)", fontWeight: 700, marginTop: 8, marginBottom: 4, borderTop: "1px solid #e0e0e0", paddingTop: 8 }}>
                          Receiving Practitioner
                        </dt>
                        <dt>Name</dt>
                        <dd>{humanName(detail.performerPractitioner?.name) || "—"}</dd>
                        <dt>Role</dt>
                        <dd>{detail.performerRole?.code?.[0]?.coding?.[0]?.display || detail.performerRole?.code?.[0]?.text || "—"}</dd>
                        <dt>Specialty</dt>
                        <dd>{specialtyText(detail.performerRole)}</dd>
                        <dt>PRC</dt>
                        <dd>{idVal(detail.performerPractitioner, "prc") || "—"}</dd>
                      </dl>
                    </div>
                  </Section>

                </>
              )}

              {activeTab === "clinical" && (
                <>
                  {/* Observations / Vitals */}
                  <Section title="Vitals & Observations" fhirBadge="Observation" count={detail.observations.length}>
                    {detail.observations.length > 0
                      ? <VitalsPanel observations={detail.observations} />
                      : <p className="muted">No vital signs or observations recorded.</p>}
                  </Section>

                  {/* Clinical Summary */}
                  <Section title="Clinical Summary" fhirBadge="Condition · Procedure" count={detail.conditions.length + detail.procedures.length}>
                    <ClinicalPanel conditions={detail.conditions} procedures={detail.procedures} />
                  </Section>

                  {/* Procedures */}
                  {detail.procedures.length > 0 && (
                    <Section title={`Procedures (${detail.procedures.length})`} resource="Procedure">
                      {detail.procedures.map((p, idx) => (
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
                            <dt>Notes</dt>
                            <dd>{p.note?.[0]?.text || "—"}</dd>
                          </dl>
                        </div>
                      ))}
                    </Section>
                  )}

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
            </div>

            <div style={{ position: "sticky", top: 16 }}>
              {/* Patient */}
              <Section title="Patient" fhirBadge="Patient">
                {detail.patient ? <PatientCard patient={detail.patient} /> : <p className="muted">No patient data available.</p>}
              </Section>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <TaskHistory serviceRequestId={sr.id} />
              </div>
              {/* Encounter — moved to right sidebar under Task History */}
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
              {/* Provenance — moved to right sidebar */}
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
            </div>
          </div>
        </>
      )}
    </>
  );
}
