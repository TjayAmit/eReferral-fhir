"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName, formatAddress, firstPhone } from "@/lib/referral";
import { buildClinicalBundle } from "@/lib/clinical-assessment";
import { DEMO_CLINICAL } from "@/lib/demo-data";
import { DISPOSITIONS, applyDisposition, withEncounterStatus, type Disposition } from "@/lib/disposition";

type Detail = { encounter: any | null; patient: any | null; observations: any[]; conditions: any[]; procedures: any[]; diagnosticReports?: any[]; serviceRequests?: any[] };

const idVal = (res: any, kind: string) => (res?.identifier || []).find((i: any) => (i.system || "").includes(kind))?.value;

const LOINC_NAME: Record<string, string> = { "85354-9": "Blood Pressure", "8867-4": "Heart Rate", "9279-1": "Respiratory Rate", "2708-6": "SpO₂", "8310-5": "Temperature", "29463-7": "Weight", "8302-2": "Height" };

const obsCode = (o: any) => o.code?.coding?.find((c: any) => c.system?.includes("loinc.org"))?.code || "";

function obsValue(o: any): string {
  if (o.dataAbsentReason) { const r = o.dataAbsentReason.coding?.[0]; return `Not recorded — ${r?.display || r?.code || "unknown"}`; }
  if (o.component?.length) { return o.component.map((c: any) => { const code = c.code?.coding?.find((x: any) => x.system?.includes("loinc.org"))?.code; const label = code === "8480-6" ? "Sys" : code === "8462-4" ? "Dia" : ""; return `${label} ${c.valueQuantity?.value ?? "—"}`.trim(); }).join(" / "); }
  if (o.valueQuantity) return `${o.valueQuantity.value} ${o.valueQuantity.unit || ""}`.trim(); if (o.valueString) return o.valueString; return "—";
}

const EMPTY_CU = { chiefComplaint: "", clinicalHistory: "", dxCode: "", dxDisplay: "", dxText: "", treatment: "", labTitle: "", labConclusion: "" };

/** Find DiagnosticReports whose basedOn references this ServiceRequest */
function findLabForServiceRequest(srId: string, reports: any[] = []): any[] {
  return reports.filter((dr) =>
    (dr.basedOn || []).some((ref: any) => {
      const r = ref.reference || "";
      return r === `ServiceRequest/${srId}` || r.endsWith(`/${srId}`);
    })
  );
}

export default function ClinicalTransferViewPage() {
  const { user, ready } = useAuth(); const { baseUrl, useDemoData } = useSettings(); const router = useRouter(); const params = useParams(); const encounterId = String(params.encounterId);
  const canAccess = user?.role === "admin" || user?.role === "practitioner";
  const [detail, setDetail] = useState<Detail | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [cu, setCu] = useState({ ...EMPTY_CU }); const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [isEditing, setIsEditing] = useState(false); const [disposing, setDisposing] = useState<string | null>(null); const [dispError, setDispError] = useState<string | null>(null); const [existingIds, setExistingIds] = useState({ chiefConditionId: "", dxConditionId: "", procedureId: "", diagnosticReportId: "" });
  useEffect(() => { if (ready && user && !canAccess) router.replace("/"); }, [ready, user, canAccess, router]);
  useEffect(() => { if (ready && canAccess) load(); }, [ready, user, baseUrl, encounterId]);

  async function load() { setLoading(true); setError(null); try { const res = await fetch(`/api/clinical-transfer?encounter=${encodeURIComponent(encounterId)}`, { headers: { "X-FHIR-Base-Url": baseUrl } }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Failed to load encounter"); setDetail(data); prefill(data); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); } }

  function prefill(d: Detail) {
    const chief = (d.conditions || []).find((c: any) => c.category?.[0]?.coding?.[0]?.code === "problem-list-item");
    const dx = (d.conditions || []).find((c: any) => c.category?.[0]?.coding?.[0]?.code === "encounter-diagnosis");
    const proc = (d.procedures || [])[0]; const dr = (d.diagnosticReports || [])[0];
    const fromServer = { chiefComplaint: chief?.code?.text || "", clinicalHistory: chief?.note?.[0]?.text || "", dxCode: dx?.code?.coding?.[0]?.code || "", dxDisplay: dx?.code?.coding?.[0]?.display || "", dxText: dx?.code?.text || "", treatment: proc?.note?.[0]?.text || "", labTitle: dr?.presentedForm?.[0]?.title || dr?.code?.text || "", labConclusion: dr?.conclusion || "" };
    setExistingIds({ chiefConditionId: chief?.id || "", dxConditionId: dx?.id || "", procedureId: proc?.id || "", diagnosticReportId: dr?.id || "" });
    const hasAny = Object.values(fromServer).some(Boolean); setCu(!hasAny && useDemoData ? { ...DEMO_CLINICAL } : fromServer);
  }

  async function handleSave(e: React.FormEvent) { e.preventDefault(); if (!detail?.patient?.id) return; setSaving(true); setSaveError(null); setNotice(null); try { const bundle = buildClinicalBundle({ patientId: detail.patient.id, practitionerId: String((user as any)?.practitionerId || ""), existingEncounterId: encounterId, effectiveDateTime: new Date().toISOString(), vitals: {}, chiefComplaint: cu.chiefComplaint || undefined, clinicalHistory: cu.clinicalHistory || undefined, diagnosis: (cu.dxCode || cu.dxDisplay || cu.dxText) ? { code: cu.dxCode || undefined, display: cu.dxDisplay || undefined, text: cu.dxText || undefined } : undefined, treatment: cu.treatment || undefined, diagnostic: (cu.labTitle || cu.labConclusion) ? { title: cu.labTitle || undefined, conclusion: cu.labConclusion || undefined } : undefined }); const res = await fetch("/api/clinical-assessment", { method: "POST", headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl }, body: JSON.stringify(bundle) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Failed to save clinical update"); if (detail.encounter && detail.encounter.status !== "finished" && detail.encounter.status !== "in-progress") { const encRes = await fetch("/api/encounter", { method: "PUT", headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl }, body: JSON.stringify(withEncounterStatus(detail.encounter, "in-progress")) }); if (!encRes.ok) { const d = await encRes.json(); throw new Error(d.error || "Saved clinical data but failed to set encounter in-progress"); } } setNotice(`Saved — clinical profile recorded; encounter set to in-progress.`); setIsEditing(false); load(); } catch (err) { setSaveError(err instanceof Error ? err.message : String(err)); } finally { setSaving(false); } }

  async function handleDisposition(choice: Disposition) { if (!detail?.encounter || !detail?.patient?.id) return; if (choice === "discharge") { if (!window.confirm("Discharge — finish the visit and send the patient home?")) return; } setDisposing(choice); setDispError(null); setNotice(null); try { const hdrs = { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl }; const { er } = applyDisposition(detail.encounter, detail.patient.id, choice, new Date().toISOString()); const erRes = await fetch("/api/encounter", { method: "PUT", headers: hdrs, body: JSON.stringify(er) }); const erData = await erRes.json(); if (!erRes.ok) throw new Error(erData.error || "Failed to finalize encounter"); setNotice(`Encounter finalized — ${choice}.`); load(); } catch (err) { setDispError(err instanceof Error ? err.message : String(err)); } finally { setDisposing(null); } }

  if (!ready || !user || !canAccess) return <div className="loading">Checking access…</div>;
  const patient = detail?.patient; const enc = detail?.encounter; const originRef = enc?.hospitalization?.origin?.reference; const age = patient?.birthDate ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null; const hasClinicalData = (detail?.conditions?.length || 0) > 0 || (detail?.procedures?.length || 0) > 0 || (detail?.diagnosticReports?.length || 0) > 0;

  return (
    <>
      <AppPageHeader items={[{ label: "Home", href: "/" }, { label: "Clinical Transfer", href: "/clinical/transfer" }, { label: enc ? `Encounter ${enc.id}` : encounterId }]} title={`Patient Vitals Encounter — ${patient ? humanName(patient.name) : encounterId}`} actions={enc && <span className="badge" style={{ background: "var(--brand)", color: "#fff" }}>{(enc.class?.display || enc.type?.[0]?.coding?.[0]?.display || "Encounter").replace(/^\w/, (c: string) => c.toUpperCase())}</span>} />
      {error && <div className="alert err">❌ {error}</div>}
      {loading && !detail && <p className="muted">Loading…</p>}
      {detail && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
          <div>
            {notice && <div className="alert ok">✅ {notice}</div>}
            {saveError && <div className="alert err">❌ {saveError}</div>}
            {!isEditing && hasClinicalData ? (
              <>
                <div className="card">
                  <div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h2 className="section-title">Service Requests</h2></div><span className="section-count">{(detail?.serviceRequests || []).length}</span></div>
                  {(detail?.serviceRequests || []).length === 0 ? <p className="muted">No service requests linked.</p> : <div style={{ display: "grid", gap: 12 }}>{(detail?.serviceRequests || []).map((sr: any) => {
                    const labs = findLabForServiceRequest(sr.id, detail?.diagnosticReports);
                    return (
                      <div key={sr.id} style={{ padding: 12, background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <code style={{ fontSize: 13 }}>{sr.id}</code>
                          <span className={`badge ${sr.status || ""}`}>{sr.status || "—"}</span>
                        </div>
                        <dl className="kv" style={{ margin: 0 }}>
                          {sr.category?.[0]?.coding?.[0]?.display && <><dt>Category</dt><dd>{sr.category[0].coding[0].display}</dd></>}
                          {sr.code?.text && <><dt>Code</dt><dd>{sr.code.text}</dd></>}
                          {sr.authoredOn && <><dt>Authored</dt><dd>{new Date(sr.authoredOn).toLocaleString()}</dd></>}
                          {sr.requester?.reference && <><dt>Requester</dt><dd><code>{sr.requester.reference}</code></dd></>}
                          {sr.performer?.[0]?.reference && <><dt>Performer</dt><dd><code>{sr.performer[0].reference}</code></dd></>}
                          {sr.reasonCode?.[0]?.text && <><dt>Reason</dt><dd>{sr.reasonCode[0].text}</dd></>}
                          {sr.note?.[0]?.text && <><dt>Note</dt><dd>{sr.note[0].text}</dd></>}
                        </dl>
                        {labs.length > 0 && (
                          <div style={{ marginTop: 10, padding: 10, background: "#f8fafc", borderRadius: 6, border: "1px dashed #cbd5e1" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Lab Result{labs.length > 1 ? "s" : ""}</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              {labs.map((lab) => (
                                <div key={lab.id}>
                                  <div style={{ fontWeight: 500, fontSize: 13 }}>{lab.code?.coding?.[0]?.display || lab.code?.text || "Laboratory"}</div>
                                  {lab.conclusion && <div style={{ fontSize: 13, color: "#334155" }}>{lab.conclusion}</div>}
                                  {lab.presentedForm?.[0]?.title && <div style={{ fontSize: 12, color: "var(--muted)" }}>{lab.presentedForm[0].title}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}</div>}
                </div>
                <div className="card"><h2>Clinical Summary</h2>{cu.chiefComplaint && <dl className="kv"><dt>Chief Complaint</dt><dd>{cu.chiefComplaint}</dd></dl>}{cu.clinicalHistory && <dl className="kv" style={{ marginTop: 12 }}><dt>Clinical History</dt><dd>{cu.clinicalHistory}</dd></dl>}{(cu.dxCode || cu.dxDisplay || cu.dxText) && <dl className="kv" style={{ marginTop: 12 }}><dt>Working Diagnosis</dt><dd>{[cu.dxCode, cu.dxDisplay, cu.dxText].filter(Boolean).join(" — ")}</dd></dl>}{cu.treatment && <dl className="kv" style={{ marginTop: 12 }}><dt>Treatment Given</dt><dd>{cu.treatment}</dd></dl>}</div>
                {(detail?.diagnosticReports?.length || 0) > 0 && (
                  <div className="card">
                    <div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h2 className="section-title">Laboratory Results</h2></div><span className="section-count">{(detail?.diagnosticReports || []).length}</span></div>
                    <div style={{ display: "grid", gap: 12 }}>
                      {(detail?.diagnosticReports || []).map((dr: any) => (
                        <div key={dr.id} style={{ padding: 12, background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontWeight: 600 }}>{dr.code?.coding?.[0]?.display || dr.code?.text || "Lab Result"}</span>
                            <span className={`badge ${dr.status || ""}`}>{dr.status || "—"}</span>
                          </div>
                          <dl className="kv" style={{ margin: 0 }}>
                            {dr.presentedForm?.[0]?.title && <><dt>Title</dt><dd>{dr.presentedForm[0].title}</dd></>}
                            {dr.conclusion && <><dt>Conclusion</dt><dd>{dr.conclusion}</dd></>}
                            {dr.effectiveDateTime && <><dt>Effective</dt><dd>{new Date(dr.effectiveDateTime).toLocaleString()}</dd></>}
                          </dl>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="card"><div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h2 className="section-title">Disposition</h2></div><span className={`badge ${enc?.status || ""}`}>{enc?.status || "—"}</span></div>{dispError && <div className="alert err">❌ {dispError}</div>}{enc?.status === "finished" ? <p className="muted" style={{ margin: 0 }}>Encounter finalized{enc?.hospitalization?.dischargeDisposition ? ` — ${enc.hospitalization.dischargeDisposition.text || enc.hospitalization.dischargeDisposition.coding?.[0]?.display}` : ""}. This visit is closed.</p> : <><p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>Select a definitive patient pathway:</p><div className="row" style={{ gap: 10 }}><button className="action-primary" onClick={() => handleDisposition("discharge")} disabled={!!disposing}>{disposing === "discharge" ? "…" : "Discharge"}</button><button className="ghost" onClick={() => setIsEditing(true)} disabled={!!disposing}>✎ Edit Clinical Data</button></div></>}</div>
              </>
            ) : (
              <form onSubmit={handleSave}>
                <div className="card"><h2>Clinical (REF-31, 32, 39, 41)</h2><div className="field"><label>Chief complaint (REF-31)</label><textarea rows={2} value={cu.chiefComplaint} onChange={(e) => setCu({ ...cu, chiefComplaint: e.target.value })} /></div><div className="field"><label>Clinical history (REF-32)</label><textarea rows={2} value={cu.clinicalHistory} onChange={(e) => setCu({ ...cu, clinicalHistory: e.target.value })} /></div><div className="grid two"><div className="field"><label>Impression code (SNOMED, REF-41)</label><input value={cu.dxCode} onChange={(e) => setCu({ ...cu, dxCode: e.target.value })} /></div><div className="field"><label>Impression display</label><input value={cu.dxDisplay} onChange={(e) => setCu({ ...cu, dxDisplay: e.target.value })} /></div></div><div className="field"><label>Impression text</label><input value={cu.dxText} onChange={(e) => setCu({ ...cu, dxText: e.target.value })} /></div><div className="field"><label>Treatment given (REF-39)</label><textarea rows={2} value={cu.treatment} onChange={(e) => setCu({ ...cu, treatment: e.target.value })} /></div></div>
                <div className="card"><h2>Laboratory (REF-40)</h2><div className="grid two"><div className="field"><label>Report title</label><input value={cu.labTitle} onChange={(e) => setCu({ ...cu, labTitle: e.target.value })} /></div><div className="field"><label>Conclusion</label><input value={cu.labConclusion} onChange={(e) => setCu({ ...cu, labConclusion: e.target.value })} /></div></div></div>
                <div className="modal-footer">{hasClinicalData && <button type="button" className="ghost" onClick={() => setIsEditing(false)}>Cancel</button>}<button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Clinical Update"}</button></div>
              </form>
            )}
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <div className="card"><div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h3 className="section-title" style={{ fontSize: 15 }}>Patient</h3></div></div>{patient ? <dl className="kv"><dt>Name</dt><dd>{humanName(patient.name)}</dd><dt>Gender / Age</dt><dd>{[patient.gender, age != null ? `${age} yrs` : null].filter(Boolean).join(" · ") || "—"}</dd><dt>PhilHealth</dt><dd>{idVal(patient, "philhealth-id") || "—"}</dd><dt>Contact</dt><dd>{firstPhone(patient.telecom)}</dd><dt>Address</dt><dd>{formatAddress(patient.address)}</dd></dl> : <p className="muted">No patient linked.</p>}</div>
            <div className="card"><div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h3 className="section-title" style={{ fontSize: 15 }}>Vitals</h3><span className="section-count">{detail.observations.length}</span></div></div><p className="muted" style={{ marginTop: -6 }}>Carried over from triage (recorded minutes ago).</p>{detail.observations.length === 0 ? <p className="muted">No vitals recorded.</p> : <table className="admin-table"><tbody>{detail.observations.map((o) => <tr key={o.id}><td>{LOINC_NAME[obsCode(o)] || o.code?.coding?.[0]?.display || "Observation"}</td><td><strong>{obsValue(o)}</strong></td></tr>)}</tbody></table>}</div>
            <div className="card"><div className="section-header"><div className="section-title-wrap"><span className="section-indicator" /><h3 className="section-title" style={{ fontSize: 15 }}>Encounter</h3></div></div>{enc ? <dl className="kv"><dt>ID</dt><dd><code>{enc.id}</code></dd><dt>Status</dt><dd><span className={`badge ${enc.status || ""}`}>{enc.status || "—"}</span></dd><dt>Type</dt><dd>{enc.type?.[0]?.coding?.[0]?.display || enc.class?.display || "—"}</dd><dt>Origin</dt><dd>{enc.hospitalization?.origin?.display || originRef || "—"}</dd><dt>Started</dt><dd>{enc.period?.start ? new Date(enc.period.start).toLocaleString() : "—"}</dd></dl> : <p className="muted">Encounter not found.</p>}</div>
          </div>
        </div>
      )}
    </>
  );
}
