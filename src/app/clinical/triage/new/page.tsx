"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import PatientForm from "@/components/PatientForm";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName } from "@/lib/referral";
import { buildPatient, type PatientFormData } from "@/lib/patient-registration";
import { buildClinicalBundle } from "@/lib/clinical-assessment";
import {
  BLANK_PATIENT_FORM,
  DEMO_PATIENT_FORM,
  BLANK_VITALS,
  DEMO_VITALS,
} from "@/lib/demo-data";

export default function NewPatientPage() {
  const { user, ready } = useAuth();
  const { baseUrl, useDemoData } = useSettings();
  const router = useRouter();

  const canAccess = user?.role === "admin" || user?.role === "practitioner";

  // ── shared reference data ───────────────────────────────────────────────
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Phase 1: Patient ────────────────────────────────────────────────────
  // Pre-fill with demo data when the "Use Demo Data" setting is on.
  const [form, setForm] = useState<PatientFormData>(() => (useDemoData ? DEMO_PATIENT_FORM : BLANK_PATIENT_FORM));
  const [existingId, setExistingId] = useState<string | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);

  // result of phase 1
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null);
  const [savedPatientName, setSavedPatientName] = useState("");

  // ── Phase 2: Encounter & Vitals ─────────────────────────────────────────
  const [attendingId, setAttendingId] = useState("");
  const [vitals, setVitals] = useState(() => ({ ...(useDemoData ? DEMO_VITALS : BLANK_VITALS) }));
  const [savingClinical, setSavingClinical] = useState(false);
  const [clinicalError, setClinicalError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user && !canAccess) router.replace("/");
  }, [ready, user, canAccess, router]);

  useEffect(() => {
    if (!ready || !canAccess) return;
    if ((user as any)?.practitionerId) setAttendingId(String((user as any).practitionerId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl]);

  // Re-apply demo/blank defaults when the "Use Demo Data" setting toggles,
  // as long as the patient hasn't been saved or matched to an existing record.
  useEffect(() => {
    if (savedPatientId || existingId) return;
    setForm(useDemoData ? DEMO_PATIENT_FORM : BLANK_PATIENT_FORM);
    setVitals({ ...(useDemoData ? DEMO_VITALS : BLANK_VITALS) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDemoData]);

  // ── Step 1: Patient Search using FHIR identifier endpoint ─
  useEffect(() => {
    const q = matchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    fetch(`/api/patient?identifier=${encodeURIComponent(q)}`, { headers: { "X-FHIR-Base-Url": baseUrl } })
      .then((r) => r.json())
      .then((d) => {
        const patients = (d.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Patient");
        setSearchResults(patients.slice(0, 6));
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [matchQuery, baseUrl]);

  function useExisting(p: any) {
    const addr = p.address?.[0] || {};
    const lines: string[] = addr.line || [];
    const kin = p.contact?.[0];
    setExistingId(p.id);
    setForm({
      philhealth: (p.identifier || []).find((i: any) => (i.system || "").includes("philhealth-id"))?.value || "",
      philsys: (p.identifier || []).find((i: any) => (i.system || "").includes("philsys-id"))?.value || "",
      givenName: p.name?.[0]?.given?.[0] || "",
      familyName: p.name?.[0]?.family || "",
      gender: p.gender || "unknown",
      birthDate: p.birthDate || "",
      phone: (p.telecom || []).find((t: any) => t.system === "phone")?.value || "",
      addressLine: lines[0] || "", barangay: lines[1] || "",
      city: addr.city || "", province: addr.state || "", postalCode: addr.postalCode || "",
      nextOfKin: {
        relationship: kin?.relationship?.[0]?.coding?.[0]?.code || "SPS",
        givenName: kin?.name?.given?.[0] || "", familyName: kin?.name?.family || "",
        phone: (kin?.telecom || []).find((t: any) => t.system === "phone")?.value || "",
      },
      active: p.active !== false,
    });
    setMatchQuery("");
  }

  async function handleSavePatient(e: React.FormEvent) {
    e.preventDefault();
    if (!form.philhealth && !form.philsys) return setPatientError("At least one identifier (PhilHealth or PhilSys) is required.");
    setSavingPatient(true);
    setPatientError(null);
    try {
      const base = buildPatient(form);
      const body = existingId ? { ...base, id: existingId } : base;
      const res = await fetch("/api/patient", {
        method: existingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save patient");
      // Phase 1 result → unlock phase 2
      setSavedPatientId(data.id || existingId);
      setSavedPatientName(humanName(base.name));
    } catch (err) {
      setPatientError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingPatient(false);
    }
  }

  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function handleSaveClinical(e: React.FormEvent) {
    e.preventDefault();
    if (!savedPatientId) return;
    setSavingClinical(true);
    setClinicalError(null);
    try {
      const bundle = buildClinicalBundle({
        patientId: savedPatientId,
        practitionerId: attendingId,
        organizationId: user?.organization?.id,
        originOrganizationId: user?.organization?.id, // Encounter.hospitalization.origin = logged-in user's org
        effectiveDateTime: new Date().toISOString(),
        encounterStatus: "triaged",
        encounterClass: { code: "EMER", display: "emergency" },
        vitals: {
              systolic: num(vitals.systolic), diastolic: num(vitals.diastolic),
              hr: num(vitals.hr), rr: num(vitals.rr), spo2: num(vitals.spo2),
              temp: num(vitals.temp), weight: num(vitals.weight), height: num(vitals.height),
            },
      });
      const res = await fetch("/api/clinical-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-FHIR-Base-Url": baseUrl },
        body: JSON.stringify(bundle),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save encounter & vitals");
      router.push("/clinical/triage");
    } catch (err) {
      setClinicalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingClinical(false);
    }
  }

  if (!ready || !user || !canAccess) {
    return <div className="loading">Checking access…</div>;
  }

  const patientLocked = !!savedPatientId;

  return (
    <>
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "Patients", href: "/clinical/triage" },
          { label: "Register Patient" },
        ]}
        title="Register Patient — Triage"
      />

      {/* Phase indicator */}
      <div className="triage-steps">
        <div className={`triage-step ${patientLocked ? "done" : "active"}`}>
          <span className="triage-step-n">{patientLocked ? "✓" : "1"}</span>
          <span>Patient</span>
        </div>
        <div className="triage-step-line" />
        <div className={`triage-step ${patientLocked ? "active" : ""}`}>
          <span className="triage-step-n">2</span>
          <span>Encounter &amp; Vitals</span>
        </div>
      </div>

      {/* ── Section 1: Patient ─────────────────────────────────────────── */}
      <div className="patient-form-card">
        <div className="patient-form-header">
          <h2 className="patient-form-title">
            <span className="patient-form-step">1</span>
            Patient
          </h2>
          {patientLocked ? (
            <span className="patient-form-badge">Saved · Patient/{savedPatientId}</span>
          ) : (
            <span className="patient-form-badge">FHIR · Patient</span>
          )}
        </div>

        {!patientLocked ? (
          <>
            {/* Search / Match — prevent duplicate records */}
            <div className="patient-form-field">
              <div className="patient-form-search-hint">Search existing patient — by PhilHealth ID or PhilSys ID, avoids duplicates</div>
              <div className="patient-form-search">
                <input
                  type="search"
                  value={matchQuery}
                  onChange={(e) => setMatchQuery(e.target.value)}
                  placeholder="e.g. 78-658064775-3 / 7731-0812-4491-0326"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="match-list">
                  {searchResults.map((p: any) => (
                    <button type="button" key={p.id} className="match-item" onClick={() => useExisting(p)}>
                      <strong>{humanName(p.name)}</strong>
                      <span className="muted">
                        {[p.gender, p.birthDate, (p.identifier || [])[0]?.value].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {existingId && (
              <div className="alert ok" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span>Updating existing <code>Patient/{existingId}</code>. Saving will update demographics.</span>
                <button type="button" className="secondary" onClick={() => { setExistingId(null); setForm(useDemoData ? DEMO_PATIENT_FORM : BLANK_PATIENT_FORM); }}>
                  Clear / new patient
                </button>
              </div>
            )}

            {patientError && <div className="alert err" style={{ marginTop: 12 }}>❌ {patientError}</div>}

            <PatientForm
              form={form}
              setForm={setForm}
              onSubmit={handleSavePatient}
              showCancel
              onCancel={() => router.push("/clinical/triage")}
              submitLabel={savingPatient ? "Saving…" : existingId ? "Save & Continue" : "+ Save Patient & Continue"}
              submitting={savingPatient}
            />
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            <strong>{savedPatientName}</strong> saved. Proceed to record the encounter and vitals below.
          </p>
        )}
      </div>

      {/* ── Section 2: Encounter & Vitals ──────────────────────────────── */}
      <div className="patient-form-card" style={{ opacity: patientLocked ? 1 : 0.5 }}>
        <div className="patient-form-header">
          <h2 className="patient-form-title">
            <span className="patient-form-step">2</span>
            Encounter &amp; Vitals
          </h2>
          <span className="patient-form-badge">Triage · Emergency</span>
        </div>

        {!patientLocked ? (
          <p className="muted" style={{ margin: 0 }}>Save the patient first to enable this section.</p>
        ) : (
          <form onSubmit={handleSaveClinical}>
            <div className="patient-form-section">Vital Signs</div>

            <div className="patient-form-grid cols-4">
                  <div className="patient-form-field">
                    <label>Systolic (mmHg)</label>
                    <input type="number" value={vitals.systolic} onChange={(e) => setVitals({ ...vitals, systolic: e.target.value })} />
                  </div>
                  <div className="patient-form-field">
                    <label>Diastolic (mmHg)</label>
                    <input type="number" value={vitals.diastolic} onChange={(e) => setVitals({ ...vitals, diastolic: e.target.value })} />
                  </div>
                  <div className="patient-form-field">
                    <label>Heart rate (/min)</label>
                    <input type="number" value={vitals.hr} onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} />
                  </div>
                  <div className="patient-form-field">
                    <label>Resp. rate (/min)</label>
                    <input type="number" value={vitals.rr} onChange={(e) => setVitals({ ...vitals, rr: e.target.value })} />
                  </div>
                </div>
                <div className="patient-form-grid cols-4">
                  <div className="patient-form-field">
                    <label>SpO₂ (%)</label>
                    <input type="number" value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} />
                  </div>
                  <div className="patient-form-field">
                    <label>Temp (°C)</label>
                    <input type="number" step="0.1" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} />
                  </div>
                  <div className="patient-form-field">
                    <label>Weight (kg)</label>
                    <input type="number" step="0.1" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} />
                  </div>
                  <div className="patient-form-field">
                    <label>Height (cm)</label>
                    <input type="number" step="0.1" value={vitals.height} onChange={(e) => setVitals({ ...vitals, height: e.target.value })} />
                  </div>
                </div>

            {clinicalError && <div className="alert err" style={{ marginTop: 12 }}>❌ {clinicalError}</div>}

            <div className="patient-form-footer">
              <button type="button" className="ghost" onClick={() => router.push("/clinical/triage")}>Skip</button>
              <button type="submit" className="primary" disabled={savingClinical}>
                {savingClinical ? "Saving…" : "+ Save Encounter & Vitals"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
