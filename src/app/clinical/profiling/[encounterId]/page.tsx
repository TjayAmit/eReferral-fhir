"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName, formatAddress, firstPhone, getPatientIdentifier } from "@/lib/referral";
import { fhirGet } from "@/lib/fhir";
import { buildClinicalBundle } from "@/lib/clinical-assessment";
import { DEMO_CLINICAL } from "@/lib/demo-data";
import { DISPOSITIONS, applyDisposition, withEncounterStatus, type Disposition } from "@/lib/disposition";
import TransferModal, { type TransferPayload } from "@/components/TransferModal";

type Detail = {
  encounter: any | null;
  patient: any | null;
  observations: any[];
  conditions: any[];
  procedures: any[];
  diagnosticReports?: any[];
  tasks?: any[];
  serviceRequests?: any[];
};

const idVal = (res: any, kind: string) =>
  (res?.identifier || []).find((i: any) => (i.system || "").includes(kind))?.value;

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

const LOINC_NAME: Record<string, string> = {
  "85354-9": "Blood Pressure", "8867-4": "Heart Rate", "9279-1": "Respiratory Rate",
  "2708-6": "SpO₂", "8310-5": "Temperature", "29463-7": "Weight", "8302-2": "Height",
};

const obsCode = (o: any) => o.code?.coding?.find((c: any) => c.system?.includes("loinc.org"))?.code || "";

function obsValue(o: any): string {
  if (o.dataAbsentReason) {
    const r = o.dataAbsentReason.coding?.[0];
    return `Not recorded — ${r?.display || r?.code || "unknown"}`;
  }
  if (o.component?.length) {
    return o.component.map((c: any) => {
      const code = c.code?.coding?.find((x: any) => x.system?.includes("loinc.org"))?.code;
      const label = code === "8480-6" ? "Sys" : code === "8462-4" ? "Dia" : "";
      return `${label} ${c.valueQuantity?.value ?? "—"}`.trim();
    }).join(" / ");
  }
  if (o.valueQuantity) return `${o.valueQuantity.value} ${o.valueQuantity.unit || ""}`.trim();
  if (o.valueString) return o.valueString;
  return "—";
}

const EMPTY_CU = {
  chiefComplaint: "", clinicalHistory: "",
  dxCode: "", dxDisplay: "", dxText: "",
  treatment: "", labTitle: "", labConclusion: "",
};

export default function ClinicalUpdateViewPage() {
  const { user, ready } = useAuth();
  const { baseUrl, useDemoData } = useSettings();
  const router = useRouter();
  const params = useParams();
  const encounterId = String(params.encounterId);

  const canAccess = user?.role === "admin" || user?.role === "practitioner";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cu, setCu] = useState({ ...EMPTY_CU });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [disposing, setDisposing] = useState<string | null>(null);
  const [dispError, setDispError] = useState<string | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  // Referral matches: patient PhilHealth ID → ServiceRequest ID from My Assigned Referrals
  const [referralMatches, setReferralMatches] = useState<Map<string, string>>(new Map());
  const [registeringPatient, setRegisteringPatient] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [existingIds, setExistingIds] = useState({
    chiefConditionId: "",
    dxConditionId: "",
    procedureId: "",
    diagnosticReportId: "",
  });

  useEffect(() => {
    if (ready && user && !canAccess) router.replace("/");
  }, [ready, user, canAccess, router]);

  useEffect(() => {
    if (ready && canAccess) {
      load();
      loadReferralMatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl, encounterId]);

  async function loadReferralMatches() {
    if (!user?.practitionerId) return;
    try {
      const taskBundle = await fhirGet(
        `Task?status=accepted&owner=Practitioner/${user.practitionerId}&_include=Task:focus&_include=Task:patient&_sort=-_lastUpdated&_count=100`,
        baseUrl,
      );

      const all = dedupeResources(taskBundle);
      const tasks = all.filter((r: any) => r.resourceType === "Task");
      const srs = all.filter((r: any) => r.resourceType === "ServiceRequest");
      const patients = all.filter((r: any) => r.resourceType === "Patient");

      const srById = new Map<string, any>(srs.map((sr: any) => [sr.id, sr]));
      const patientById = new Map<string, any>(patients.map((p: any) => [p.id, p]));

      const matches = new Map<string, string>();
      for (const task of tasks) {
        const srId = refId(task.focus?.reference || "");
        const patientId = refId(task.for?.reference || "");
        const sr = srById.get(srId) || null;
        const patient = patientById.get(patientId) || null;
        if (sr && patient) {
          const phId = getPatientIdentifier(patient, "philhealth") || getPatientIdentifier(patient, "philhealth-id");
          if (phId) matches.set(phId, srId);
        }
      }
      setReferralMatches(matches);
    } catch {
      // silently ignore — referral matching is optional
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clinical-assessment?encounter=${encodeURIComponent(encounterId)}`, {
        headers: { "X-FHIR-Base-Url": baseUrl },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load encounter");
      setDetail(data);
      prefill(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Prefill the clinical fields from anything already recorded on this encounter.
  // If nothing is recorded yet and "Use Demo Data" is on, pre-fill with demo values.
  function prefill(d: Detail) {
    const chief = (d.conditions || []).find((c: any) => c.category?.[0]?.coding?.[0]?.code === "problem-list-item");
    const dx = (d.conditions || []).find((c: any) => c.category?.[0]?.coding?.[0]?.code === "encounter-diagnosis");
    const proc = (d.procedures || [])[0];
    const dr = (d.diagnosticReports || [])[0];
    const fromServer = {
      chiefComplaint: chief?.code?.text || "",
      clinicalHistory: chief?.note?.[0]?.text || "",
      dxCode: dx?.code?.coding?.[0]?.code || "",
      dxDisplay: dx?.code?.coding?.[0]?.display || "",
      dxText: dx?.code?.text || "",
      treatment: proc?.note?.[0]?.text || "",
      labTitle: dr?.presentedForm?.[0]?.title || dr?.code?.text || "",
      labConclusion: dr?.conclusion || "",
    };

    setExistingIds({
      chiefConditionId: chief?.id || "",
      dxConditionId: dx?.id || "",
      procedureId: proc?.id || "",
      diagnosticReportId: dr?.id || "",
    });

    const hasAny = Object.values(fromServer).some(Boolean);
    setCu(!hasAny && useDemoData ? { ...DEMO_CLINICAL } : fromServer);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); 

    if (!detail?.patient?.id) return;

    setSaving(true);
    setSaveError(null);
    setNotice(null);
    
    try {
      const bundle = buildClinicalBundle({
        patientId: detail.patient.id,
        practitionerId: String((user as any)?.practitionerId || ""), // unused in update mode
        existingEncounterId: encounterId, // attach to the triage encounter — no new encounter
        effectiveDateTime: new Date().toISOString(),
        vitals: {}, // vitals are reused from triage — not re-recorded here
        chiefComplaint: cu.chiefComplaint || undefined,
        clinicalHistory: cu.clinicalHistory || undefined,
        diagnosis: (cu.dxCode || cu.dxDisplay || cu.dxText)
          ? { code: cu.dxCode || undefined, display: cu.dxDisplay || undefined, text: cu.dxText || undefined }
          : undefined,
        treatment: cu.treatment || undefined,
        diagnostic: (cu.labTitle || cu.labConclusion)
          ? { title: cu.labTitle || undefined, conclusion: cu.labConclusion || undefined }
          : undefined,
      });
      const res = await fetch("/api/clinical-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
        body: JSON.stringify(bundle),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save clinical update");

      // Step 2 — set the encounter to "in-progress" (awaiting decision) as a
      // separate Encounter update (NOT inside the clinical bundle, which references it).
      if (detail.encounter && detail.encounter.status !== "finished" && detail.encounter.status !== "in-progress") {
        const encRes = await fetch("/api/encounter", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
          body: JSON.stringify(withEncounterStatus(detail.encounter, "in-progress")),
        });
        if (!encRes.ok) {
          const d = await encRes.json();
          throw new Error(d.error || "Saved clinical data but failed to set encounter in-progress");
        }
      }
      setNotice(`Saved — clinical profile recorded; encounter set to in-progress.`);
      setIsEditing(false);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // Register patient from incoming referral
  async function handleRegisterPatient() {
    if (!detail?.patient) return;

    setRegisteringPatient(true);
    setRegisterError(null);
    setNotice(null);

    try {
      const hdrs = { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl };
      const patient = detail.patient;

      // Extract PhilHealth and PhilSys identifiers
      const philhealthId = idVal(patient, "philhealth-id");
      const philsysId = idVal(patient, "philsys-id");

      const patientData = {
        resourceType: "Patient",
        name: patient.name,
        gender: patient.gender,
        birthDate: patient.birthDate,
        telecom: patient.telecom,
        address: patient.address,
        identifier: patient.identifier,
      };

      const res = await fetch("/api/patient", { method: "POST", headers: hdrs, body: JSON.stringify(patientData) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register patient");

      setNotice(`Patient registered successfully${philhealthId ? " (PhilHealth: " + philhealthId + ")" : ""}${philsysId ? " (PhilSys: " + philsysId + ")" : ""}`);
      load();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegisteringPatient(false);
    }
  }

  // Step 3/4 — finalize the encounter per the doctor's disposition choice.
  async function handleDisposition(choice: Disposition, transferPayload?: TransferPayload) {
    if (!detail?.encounter || !detail?.patient?.id) return;
    if (choice !== "transfer") {
      const verb: Record<Disposition, string> = {
        discharge: "Discharge — finish the visit and send the patient home",
        transfer: "Transfer — finish the visit and mark transferred to another facility",
        admit: "Admit — finish the ER visit and open a NEW inpatient encounter",
      };
      if (!window.confirm(`${verb[choice]}?`)) return;
    }
    setDisposing(choice);
    setDispError(null);
    setNotice(null);
    try {
      const hdrs = { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl };
      const note = transferPayload?.note;
      const serviceType = transferPayload?.serviceType;
      const { er, inpatient } = applyDisposition(detail.encounter, detail.patient.id, choice, new Date().toISOString(), note);

      // Admit: create the inpatient encounter FIRST so a failure never leaves the
      // ER finished with no admission. Only then finalize the ER encounter.
      let inpatientId = "";
      if (inpatient) {
        const ipRes = await fetch("/api/encounter", { method: "POST", headers: hdrs, body: JSON.stringify(inpatient) });
        const ipData = await ipRes.json();
        if (!ipRes.ok) throw new Error(ipData.error || "Failed to create inpatient encounter");
        inpatientId = ipData.id;
      }

      // Transfer: create a draft ServiceRequest linked to the encounter + patient.
      let serviceRequestId = "";
      if (choice === "transfer" && transferPayload) {
        const orgId = user?.organization?.id || "UNKNOWN";
        const year = new Date().getFullYear();
        const uniqueValue = Date.now();
        const requisitionValue = `ORG-${orgId}-${year}-${uniqueValue}`;
        const patientName = detail.patient.name?.[0]?.text || detail.patient.name?.[0]?.family || "Patient";
        const transferNote = note || "Patient transfer to another facility";
        const sr = {
          resourceType: "ServiceRequest",
          meta: { profile: ["https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-service-request"] },
          language: "en",
          text: {
            status: "generated",
            div: `<div xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><p><b>Generated Narrative: ServiceRequest</b></p><p>Requisition: ${requisitionValue} · Category: Emergency</p><p>Reason: ${transferNote}</p></div>`,
          },
          status: "draft",
          intent: "order",
          category: [{ coding: [{ system: "http://snomed.info/sct", code: "73770003", display: "Hospital-based outpatient emergency care center" }], text: "Emergency" }],
          reasonCode: serviceType ? [{ coding: [{ system: serviceType.system, code: serviceType.code, display: serviceType.display }] }] : undefined,
          subject: { reference: `Patient/${detail.patient.id}` },
          encounter: { reference: `Encounter/${detail.encounter.id}` },
          authoredOn: new Date().toISOString(),
          requisition: { system: "urn:oid:1.2.840.113619.21.1.2", value: requisitionValue },
          requester: user?.practitionerRole?.id ? { reference: `PractitionerRole/${user.practitionerRole.id}` } : undefined,
          ...(note ? { note: [{ text: note }] } : {}),
        };
        const srRes = await fetch("/api/service-request", { method: "POST", headers: hdrs, body: JSON.stringify(sr) });
        const srData = await srRes.json();
        if (!srRes.ok) throw new Error(srData.error || "Failed to create transfer ServiceRequest");
        serviceRequestId = srData.id;
      }

      const erRes = await fetch("/api/encounter", { method: "PUT", headers: hdrs, body: JSON.stringify(er) });
      const erData = await erRes.json();
      if (!erRes.ok) throw new Error(erData.error || "Failed to finalize encounter");

      setNotice(
        choice === "admit"
          ? `Admitted — ER encounter finished; inpatient Encounter/${inpatientId} created.`
          : choice === "transfer"
            ? `Transferred — ER encounter in-progress; draft ServiceRequest/${serviceRequestId} created.`
            : `Encounter finalized — ${choice}.`,
      );
      load();
    } catch (err) {
      setDispError(err instanceof Error ? err.message : String(err));
    } finally { 
      setDisposing(null);
    }
  }

  if (!ready || !user || !canAccess) {
    return <div className="loading">Checking access…</div>;
  }

  const patient = detail?.patient;
  const enc = detail?.encounter;
  const originRef = enc?.hospitalization?.origin?.reference;
  const age = patient?.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  // Clinical data already recorded on this encounter?
  const hasClinicalData = (detail?.conditions?.length || 0) > 0 || (detail?.procedures?.length || 0) > 0;

  // eReferral detection via My Assigned Referrals
  const philhealthId = getPatientIdentifier(patient, "philhealth-id");
  const hasReferral = philhealthId ? referralMatches.has(philhealthId) : false;
  const serviceRequestId = hasReferral ? referralMatches.get(philhealthId!) : "";

  // Check if there's a task with status = "accepted" or "completed"
  const hasAcceptedTask = (detail?.tasks || []).some((t: any) => t.status === "accepted" || t.status === "completed");

  return (
    <>
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "Clinical Update", href: "/clinical/profiling" },
          { label: enc ? `Encounter ${enc.id}` : encounterId },
        ]}
        title={`Patient Vitals Encounter — ${patient ? humanName(patient.name) : encounterId}`}
        actions={
          enc && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="badge" style={{ background: "var(--brand)", color: "#fff" }}>
                {(enc.class?.display || enc.type?.[0]?.coding?.[0]?.display || "Encounter")
                  .replace(/^\w/, (c: string) => c.toUpperCase())}
              </span>
              {hasReferral && (
                <button
                  className="action-primary"
                  onClick={() => router.push(`/clinical/my-referrals/${serviceRequestId}`)}
                  style={{ fontSize: 12, padding: "4px 12px" }}
                >
                  Review Referral
                </button>
              )}
              {hasReferral && philhealthId && (
                <span className="badge accepted" style={{ fontSize: 11, padding: "2px 8px" }}>
                  From Referral
                </span>
              )}
            </div>
          )
        }
      />

      {error && <div className="alert err">❌ {error}</div>}
      {loading && !detail && <p className="muted">Loading…</p>}

      {detail && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
          {/* ── Left: clinical update (editable or read-only) ─────── */}
          <div>
            {notice && <div className="alert ok">✅ {notice}</div>}
            {saveError && <div className="alert err">❌ {saveError}</div>}
            {registerError && <div className="alert err">❌ {registerError}</div>}

            {!isEditing && hasClinicalData ? (
              <>
                {/* Read-only clinical summary */}
                <div className="card">
                  <h2>Clinical Summary</h2>
                  {cu.chiefComplaint && (
                    <dl className="kv">
                      <dt>Chief Complaint</dt><dd>{cu.chiefComplaint}</dd>
                    </dl>
                  )}
                  {cu.clinicalHistory && (
                    <dl className="kv" style={{ marginTop: 12 }}>
                      <dt>Clinical History</dt><dd>{cu.clinicalHistory}</dd>
                    </dl>
                  )}
                  {(cu.dxCode || cu.dxDisplay || cu.dxText) && (
                    <dl className="kv" style={{ marginTop: 12 }}>
                      <dt>Working Diagnosis</dt>
                      <dd>{[cu.dxCode, cu.dxDisplay, cu.dxText].filter(Boolean).join(" — ")}</dd>
                    </dl>
                  )}
                  {cu.treatment && (
                    <dl className="kv" style={{ marginTop: 12 }}>
                      <dt>Treatment Given</dt><dd>{cu.treatment}</dd>
                    </dl>
                  )}
                </div>

                {(cu.labTitle || cu.labConclusion) && (
                  <div className="card">
                    <h2>Laboratory</h2>
                    <dl className="kv">
                      {cu.labTitle && <><dt>Report Title</dt><dd>{cu.labTitle}</dd></>}
                      {cu.labConclusion && <><dt>Conclusion</dt><dd>{cu.labConclusion}</dd></>}
                    </dl>
                  </div>
                )}

                {/* ── Disposition (Step 3 menu / Step 4 finalize) ───────── */}
                <div className="card">
                  <div className="section-header">
                    <div className="section-title-wrap"><span className="section-indicator" /><h2 className="section-title">Disposition</h2></div>
                    <span className={`badge ${enc?.status || ""}`}>{enc?.status || "—"}</span>
                  </div>
                  {dispError && <div className="alert err">❌ {dispError}</div>}
                  {enc?.status === "finished" ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Encounter finalized
                      {enc?.hospitalization?.dischargeDisposition
                        ? ` — ${enc.hospitalization.dischargeDisposition.text || enc.hospitalization.dischargeDisposition.coding?.[0]?.display}`
                        : ""}. This visit is closed.
                    </p>
                  ) : (
                    <>
                      <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>Select a definitive patient pathway:</p>
                      <div className="row" style={{ gap: 10 }}>
                        {DISPOSITIONS.map((d) => (
                          <button
                            key={d.value}
                            className={d.value === "discharge" ? "action-primary" : d.value === "transfer" ? "secondary" : ""}
                            onClick={() => d.value === "transfer" ? setTransferModalOpen(true) : handleDisposition(d.value)}
                            disabled={!!disposing}
                            title={d.description}
                          >
                            {disposing === d.value ? "…" : d.label}
                          </button>
                        ))}
                        <button className="ghost" onClick={() => setIsEditing(true)} disabled={!!disposing}>✎ Edit Clinical Data</button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={handleSave}>
                {/* Clinical (REF-31, 32, 39, 41) */}
                <div className="card">
                  <h2>Clinical (REF-31, 32, 39, 41)</h2>
                  <div className="field"><label>Chief complaint (REF-31)</label>
                    <textarea rows={2} value={cu.chiefComplaint} onChange={(e) => setCu({ ...cu, chiefComplaint: e.target.value })} /></div>
                  <div className="field"><label>Clinical history (REF-32)</label>
                    <textarea rows={2} value={cu.clinicalHistory} onChange={(e) => setCu({ ...cu, clinicalHistory: e.target.value })} /></div>
                  <div className="grid two">
                    <div className="field"><label>Impression code (SNOMED, REF-41)</label>
                      <input value={cu.dxCode} onChange={(e) => setCu({ ...cu, dxCode: e.target.value })} /></div>
                    <div className="field"><label>Impression display</label>
                      <input value={cu.dxDisplay} onChange={(e) => setCu({ ...cu, dxDisplay: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Impression text</label>
                    <input value={cu.dxText} onChange={(e) => setCu({ ...cu, dxText: e.target.value })} /></div>
                  <div className="field"><label>Treatment given (REF-39)</label>
                    <textarea rows={2} value={cu.treatment} onChange={(e) => setCu({ ...cu, treatment: e.target.value })} /></div>
                </div>

                {/* Laboratory (REF-40) */}
                <div className="card">
                  <h2>Laboratory (REF-40)</h2>
                  <div className="grid two">
                    <div className="field"><label>Report title</label>
                      <input value={cu.labTitle} onChange={(e) => setCu({ ...cu, labTitle: e.target.value })} /></div>
                    <div className="field"><label>Conclusion</label>
                      <input value={cu.labConclusion} onChange={(e) => setCu({ ...cu, labConclusion: e.target.value })} /></div>
                  </div>
                </div>

                <div className="modal-footer">
                  {hasClinicalData && (
                    <button type="button" className="ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                  )}
                  <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Clinical Update"}</button>
                </div>
              </form>
            )}
          </div>

          {/* ── Right: read-only context (Patient, Vitals, Encounter) ── */}
          <div style={{ display: "grid", gap: 16 }}>
            <div className="card">
              <div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h3 className="section-title" style={{ fontSize: 15 }}>Patient</h3></div></div>
              {patient ? (
                <dl className="kv">
                  <dt>Name</dt><dd>{humanName(patient.name)}</dd>
                  <dt>Gender / Age</dt><dd>{[patient.gender, age != null ? `${age} yrs` : null].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt>PhilHealth</dt><dd>{idVal(patient, "philhealth-id") || "—"}</dd>
                  <dt>Contact</dt><dd>{firstPhone(patient.telecom)}</dd>
                  <dt>Address</dt><dd>{formatAddress(patient.address)}</dd>
                </dl>
              ) : <p className="muted">No patient linked.</p>}
            </div>

            <div className="card">
              <div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h3 className="section-title" style={{ fontSize: 15 }}>Vitals</h3><span className="section-count">{detail.observations.length}</span></div></div>
              <p className="muted" style={{ marginTop: -6 }}>Carried over from triage (recorded minutes ago).</p>
              {detail.observations.length === 0 ? (
                <p className="muted">No vitals recorded.</p>
              ) : (
                <table className="admin-table">
                  <tbody>
                    {detail.observations.map((o) => (
                      <tr key={o.id}>
                        <td>{LOINC_NAME[obsCode(o)] || o.code?.coding?.[0]?.display || "Observation"}</td>
                        <td><strong>{obsValue(o)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h3 className="section-title" style={{ fontSize: 15 }}>Encounter</h3></div></div>
              {enc ? (
                <dl className="kv">
                  <dt>ID</dt><dd><code>{enc.id}</code></dd>
                  <dt>Status</dt><dd><span className={`badge ${enc.status || ""}`}>{enc.status || "—"}</span></dd>
                  <dt>Type</dt><dd>{enc.type?.[0]?.coding?.[0]?.display || enc.class?.display || "—"}</dd>
                  <dt>Origin</dt><dd>{enc.hospitalization?.origin?.display || originRef || "—"}</dd>
                  <dt>Started</dt><dd>{enc.period?.start ? new Date(enc.period.start).toLocaleString() : "—"}</dd>
                </dl>
              ) : <p className="muted">Encounter not found.</p>}
            </div>
          </div>
        </div>
      )}
      <TransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onConfirm={(payload) => {
          setTransferModalOpen(false);
          handleDisposition("transfer", payload);
        }}
        disabled={!!disposing}
      />
    </>
  );
}
