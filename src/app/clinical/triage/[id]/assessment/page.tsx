"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName } from "@/lib/referral";
import { buildClinicalBundle, type ClinicalAssessmentInput } from "@/lib/clinical-assessment";

function nowLocalISO() {
  // value for <input type="datetime-local"> (no seconds/zone)
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function AssessmentPage() {
  const { user, ready } = useAuth();
  const { baseUrl } = useSettings();
  const router = useRouter();
  const params = useParams();
  const patientId = String(params.id);

  const [patient, setPatient] = useState<any>(null);
  const [practitioners, setPractitioners] = useState<any[]>([]);
  const [clinical, setClinical] = useState<{ encounters: any[]; observations: any[]; conditions: any[]; procedures: any[] }>({
    encounters: [], observations: [], conditions: [], procedures: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    practitionerId: "",
    effectiveDateTime: nowLocalISO(),
    systolic: "", diastolic: "", hr: "", rr: "", spo2: "", temp: "", weight: "", height: "",
    chiefComplaint: "",
    clinicalHistory: "",
    dxCode: "", dxDisplay: "", dxText: "",
    treatment: "",
  });

  const canAccess = user?.role === "admin" || user?.role === "practitioner";

  useEffect(() => {
    if (ready && user && !canAccess) router.replace("/");
  }, [ready, user, canAccess, router]);

  useEffect(() => {
    if (ready && canAccess) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl, patientId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [patRes, practRes, clinRes] = await Promise.all([
        fetch(`/api/patient?id=${patientId}`, { headers: { "X-FHIR-Base-Url": baseUrl } }),
        fetch(`/api/practitioner`, { headers: { "X-FHIR-Base-Url": baseUrl } }),
        fetch(`/api/clinical-assessment?patient=${patientId}`, { headers: { "X-FHIR-Base-Url": baseUrl } }),
      ]);
      const [pat, pract, clin] = await Promise.all([patRes.json(), practRes.json(), clinRes.json()]);
      if (!patRes.ok) throw new Error(pat.error || "Failed to load patient");
      setPatient(pat);
      setPractitioners(
        (pract.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Practitioner")
      );
      if (clinRes.ok) setClinical(clin);
      // default the attending doctor to the logged-in practitioner if known
      const myPractId = (user as any)?.practitionerId;
      if (myPractId) setForm((f) => ({ ...f, practitionerId: String(myPractId) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(null);
    if (!form.practitionerId) {
      setError("Select the attending doctor.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const orgId = patient?.managingOrganization?.reference?.split("/").pop();
      const input: ClinicalAssessmentInput = {
        patientId,
        practitionerId: form.practitionerId,
        organizationId: orgId,
        effectiveDateTime: new Date(form.effectiveDateTime).toISOString(),
        vitals: {
          systolic: num(form.systolic), diastolic: num(form.diastolic),
          hr: num(form.hr), rr: num(form.rr), spo2: num(form.spo2),
          temp: num(form.temp), weight: num(form.weight), height: num(form.height),
        },
        chiefComplaint: form.chiefComplaint || undefined,
        clinicalHistory: form.clinicalHistory || undefined,
        diagnosis: (form.dxCode || form.dxDisplay || form.dxText)
          ? { code: form.dxCode || undefined, display: form.dxDisplay || undefined, text: form.dxText || undefined }
          : undefined,
        treatment: form.treatment || undefined,
      };
      const bundle = buildClinicalBundle(input);
      const res = await fetch("/api/clinical-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
        body: JSON.stringify(bundle),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save clinical data");
      const created = (data.entry || []).length;
      setSuccess(`Saved — ${created} clinical resource(s) recorded.`);
      // reset clinical entry fields, keep doctor + time
      setForm((f) => ({
        ...f,
        systolic: "", diastolic: "", hr: "", rr: "", spo2: "", temp: "", weight: "", height: "",
        chiefComplaint: "", clinicalHistory: "", dxCode: "", dxDisplay: "", dxText: "", treatment: "",
      }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !user || !canAccess) {
    return <div className="loading">Checking access…</div>;
  }

  const orgRef = patient?.managingOrganization;

  return (
    <>
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "Admin", href: "/admin" },
          { label: "Patients (Triage)", href: "/clinical/triage" },
          { label: "Clinical Assessment" },
        ]}
        title={`Clinical Assessment — ${patient ? humanName(patient.name) : patientId}`}
        actions={<button className="secondary" onClick={() => router.push("/clinical/triage")}>Back to Patients</button>}
      />

      {error && <div className="alert err">❌ {error}</div>}
      {success && <div className="alert ok">✅ {success}</div>}

      {loading && !patient ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Patient</h3>
            <p className="muted" style={{ margin: 0 }}>
              <strong>{patient ? humanName(patient.name) : patientId}</strong>
              {patient?.gender ? ` · ${patient.gender}` : ""}
              {patient?.birthDate ? ` · ${patient.birthDate}` : ""}
              {orgRef ? ` · Triaged at ${orgRef.display || orgRef.reference}` : ""}
            </p>
          </div>

          <div className="card">
            <form onSubmit={handleSubmit}>
              <div className="row">
                <div className="field">
                  <label>Attending Doctor — required</label>
                  <select
                    value={form.practitionerId}
                    onChange={(e) => setForm({ ...form, practitionerId: e.target.value })}
                    required
                  >
                    <option value="">Select practitioner…</option>
                    {practitioners.map((p) => (
                      <option key={p.id} value={p.id}>{humanName(p.name)} ({p.id})</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Assessment Date/Time</label>
                  <input
                    type="datetime-local"
                    value={form.effectiveDateTime}
                    onChange={(e) => setForm({ ...form, effectiveDateTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <h3>Vital Signs</h3>
              <div className="row">
                <div className="field"><label>Systolic (mmHg)</label><input type="number" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} /></div>
                <div className="field"><label>Diastolic (mmHg)</label><input type="number" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} /></div>
                <div className="field"><label>Heart rate (/min)</label><input type="number" value={form.hr} onChange={(e) => setForm({ ...form, hr: e.target.value })} /></div>
                <div className="field"><label>Resp. rate (/min)</label><input type="number" value={form.rr} onChange={(e) => setForm({ ...form, rr: e.target.value })} /></div>
              </div>
              <div className="row">
                <div className="field"><label>SpO₂ (%)</label><input type="number" value={form.spo2} onChange={(e) => setForm({ ...form, spo2: e.target.value })} /></div>
                <div className="field"><label>Temp (°C)</label><input type="number" step="0.1" value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} /></div>
                <div className="field"><label>Weight (kg)</label><input type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></div>
                <div className="field"><label>Height (cm)</label><input type="number" step="0.1" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></div>
              </div>

              <h3>Assessment</h3>
              <div className="field">
                <label>Chief Complaint</label>
                <input value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} placeholder="e.g. Severe headache" />
              </div>
              <div className="field">
                <label>Clinical History / Notes</label>
                <textarea value={form.clinicalHistory} onChange={(e) => setForm({ ...form, clinicalHistory: e.target.value })} rows={3} />
              </div>

              <h3>Working Diagnosis</h3>
              <div className="row">
                <div className="field"><label>SNOMED Code</label><input value={form.dxCode} onChange={(e) => setForm({ ...form, dxCode: e.target.value })} placeholder="e.g. 38341003" /></div>
                <div className="field"><label>Display</label><input value={form.dxDisplay} onChange={(e) => setForm({ ...form, dxDisplay: e.target.value })} placeholder="e.g. Hypertensive disorder" /></div>
                <div className="field"><label>Free-text</label><input value={form.dxText} onChange={(e) => setForm({ ...form, dxText: e.target.value })} placeholder="e.g. Hypertensive urgency" /></div>
              </div>

              <h3>Treatment Given</h3>
              <div className="field">
                <label>Treatment / Plan</label>
                <textarea value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} rows={2} />
              </div>

              <div className="modal-footer">
                <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Clinical Data"}</button>
              </div>
            </form>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Recorded Clinical Data</h3>
            <p className="muted">
              {clinical.encounters.length} encounter(s) · {clinical.observations.length} observation(s) ·{" "}
              {clinical.conditions.length} condition(s) · {clinical.procedures.length} procedure(s)
            </p>
            {clinical.conditions.length > 0 && (
              <>
                <h4>Conditions</h4>
                <ul>
                  {clinical.conditions.map((c: any) => (
                    <li key={c.id}>
                      {c.code?.text || c.code?.coding?.[0]?.display || "—"}
                      {c.category?.[0]?.coding?.[0]?.code ? ` (${c.category[0].coding[0].code})` : ""}
                      {c.recordedDate ? ` · ${c.recordedDate}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {clinical.observations.length > 0 && (
              <>
                <h4>Observations</h4>
                <ul>
                  {clinical.observations.map((o: any) => (
                    <li key={o.id}>
                      {o.code?.coding?.[0]?.display || o.code?.text || "—"}
                      {o.valueQuantity ? `: ${o.valueQuantity.value} ${o.valueQuantity.unit}` : ""}
                      {o.component?.length ? `: ${o.component.map((cp: any) => cp.valueQuantity?.value).filter(Boolean).join("/")}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
