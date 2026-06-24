"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppPageHeader from "@/components/AppPageHeader";
import { useSettings } from "@/lib/settings-context";
import type { Bundle, Condition, Encounter, FhirResource, Observation, Patient, Procedure } from "fhir/r4";
import { addressText, ageFrom, ccText, clinStatus, fmtDate, idValue, initials, obsCategory, obsValue, patientName, severityBand, verStatus } from "./shared";

const PHILHEALTH_SYS = "http://philhealth.gov.ph/fhir/Identifier/philhealth-id";
const PHILSYS_SYS = "http://philsys.gov.ph/fhir/Identifier/philsys-id";

const STATUS_COLOR: Record<string, string> = {
  active: "var(--dash-active)",
  recurrence: "#db2777",
  relapse: "#c026d3",
  inactive: "#2563eb",
  remission: "#0d9488",
  resolved: "var(--dash-resolved)",
};

function statusPill(s: string): JSX.Element {
  const c = STATUS_COLOR[s] || "var(--dash-unknown)";
  return (
    <span className="dash-pill" style={{ background: c + "1a", color: c }}>
      <span className="dot" style={{ background: c }} />
      {s || "unknown"}
    </span>
  );
}

export default function PatientDashboard() {
  const { baseUrl, server } = useSettings();
  const [philhealth, setPhilhealth] = useState("78-658064775-3");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [bundle, setBundle] = useState<Bundle<FhirResource> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState("—");

  const buildUrl = useCallback(() => {
    const base = baseUrl.replace(/\/+$/, "");
    const inc = [
      "_revinclude=Encounter:subject",
      "_revinclude=Condition:subject",
      "_revinclude=Observation:subject",
      "_revinclude=Procedure:subject",
      "_revinclude=DiagnosticReport:subject",
      "_include:iterate=Encounter:service-provider",
      "_include:iterate=Encounter:participant",
      "_include:iterate=PractitionerRole:practitioner",
      "_include:iterate=PractitionerRole:organization",
      "_count=200",
    ].join("&");
    return `${base}/Patient?identifier=${encodeURIComponent(PHILHEALTH_SYS)}|${encodeURIComponent(philhealth.trim())}&${inc}`;
  }, [baseUrl, philhealth]);

  const load = useCallback(async () => {
    const url = buildUrl();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { headers: { Accept: "application/fhir+json" } });
      if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
      const data: Bundle<FhirResource> = await res.json();
      setBundle(data);
      setStamp("Updated " + new Date().toLocaleTimeString("en-PH"));
    } catch (err) {
      const msg = err instanceof Error && /Failed to fetch/.test(err.message)
        ? "Could not reach the FHIR server (network or CORS). Check the Base URL and that the server allows browser requests."
        : err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const patient = useMemo(() => {
    if (!bundle) return null;
    const entries = bundle.entry || [];
    const match = entries.find((e) => e.search?.mode === "match" && e.resource?.resourceType === "Patient");
    const resources = entries.map((e) => e.resource).filter(Boolean) as FhirResource[];
    return (match?.resource as Patient) || (resources.find((r) => r.resourceType === "Patient") as Patient | undefined) || null;
  }, [bundle]);

  const resources = useMemo(() => {
    if (!bundle) return [];
    return (bundle.entry || []).map((e) => e.resource).filter(Boolean) as FhirResource[];
  }, [bundle]);

  const mine = useMemo(() => {
    if (!patient) return { encs: [], conds: [], obs: [], procs: [], orgs: {}, roles: {}, pracs: {} };
    const pref = "Patient/" + patient.id;
    const isMine = (r: FhirResource) => {
      const s = (r as { subject?: { reference?: string }; patient?: { reference?: string } }).subject || (r as { patient?: { reference?: string } }).patient;
      return s?.reference?.endsWith(pref) || false;
    };
    const encs = resources.filter((r) => r.resourceType === "Encounter" && isMine(r)) as Encounter[];
    const conds = resources.filter((r) => r.resourceType === "Condition" && isMine(r)) as Condition[];
    const obs = resources.filter((r) => r.resourceType === "Observation" && isMine(r)) as Observation[];
    const procs = resources.filter((r) => r.resourceType === "Procedure" && isMine(r)) as Procedure[];
    const orgs: Record<string, { name?: string }> = {};
    resources.filter((r) => r.resourceType === "Organization").forEach((o) => (orgs[o.id!] = o as { name?: string }));
    const roles: Record<string, { practitioner?: { display?: string } }> = {};
    resources.filter((r) => r.resourceType === "PractitionerRole").forEach((pr) => (roles[pr.id!] = pr as { practitioner?: { display?: string } }));
    const pracs: Record<string, { name?: Array<{ given?: string[]; family?: string; prefix?: string[]; suffix?: string[] }> }> = {};
    resources.filter((r) => r.resourceType === "Practitioner").forEach((p) => (pracs[p.id!] = p as { name?: Array<{ given?: string[]; family?: string; prefix?: string[]; suffix?: string[] }> }));
    return { encs, conds, obs, procs, orgs, roles, pracs };
  }, [resources, patient]);

  const latestBp = useMemo(() => {
    const bps = mine.obs
      .filter((o) => {
        const codes = (o.code?.coding || []).map((c) => c.code);
        return codes.includes("85354-9") || (o.component || []).some((c) => (c.code?.coding || []).some((x) => x.code === "8480-6"));
      })
      .sort((a, b) => new Date(b.effectiveDateTime || 0).getTime() - new Date(a.effectiveDateTime || 0).getTime());
    if (!bps[0]) return "—";
    const comp = bps[0].component || [];
    const sys = comp.find((c) => (c.code?.coding || []).some((x) => x.code === "8480-6"))?.valueQuantity;
    const dia = comp.find((c) => (c.code?.coding || []).some((x) => x.code === "8462-4"))?.valueQuantity;
    return sys && dia ? `${sys.value}/${dia.value}` : obsValue(bps[0]);
  }, [mine]);

  const latestEnc = useMemo(() => {
    return [...mine.encs].sort((a, b) => new Date((b.period?.start || 0)).getTime() - new Date((a.period?.start || 0)).getTime())[0];
  }, [mine]);

  const latestEncLine = useMemo(() => {
    if (!latestEnc) return null;
    const cls = latestEnc.class?.display || latestEnc.class?.code || "";
    const sp = latestEnc.serviceProvider;
    let facility = sp?.display || "";
    if (!facility && sp?.reference) {
      const o = mine.orgs[sp.reference.split("/").pop() || ""];
      facility = o?.name || "";
    }
    const per = latestEnc.period ? [fmtDate(latestEnc.period.start), latestEnc.period.end ? fmtDate(latestEnc.period.end) : ""].filter(Boolean).join(" → ") : "";
    let attending = "";
    const part = latestEnc.participant?.[0];
    if (part?.individual?.reference) {
      attending = part.individual.display || "";
      if (!attending) {
        const role = mine.roles[part.individual.reference.split("/").pop() || ""];
        if (role?.practitioner) attending = role.practitioner.display || "";
      }
    }
    return { cls, facility, per, attending, status: latestEnc.status };
  }, [latestEnc, mine]);

  const name = patient ? patientName(patient) : "";
  const sex = patient?.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : "—";

  const dxRows = useMemo(() => {
    return [...mine.conds].sort((a, b) => new Date(b.recordedDate || b.onsetDateTime || 0).getTime() - new Date(a.recordedDate || a.onsetDateTime || 0).getTime());
  }, [mine]);

  const obsRows = useMemo(() => {
    return [...mine.obs].sort((a, b) => new Date(b.effectiveDateTime || 0).getTime() - new Date(a.effectiveDateTime || 0).getTime());
  }, [mine]);

  function reset() {
    setPhilhealth("78-658064775-3");
    load();
  }

  return (
    <div className="dashboard dashboard-patient">
      <AppPageHeader
        items={[{ label: "Home", href: "/" }, { label: "Patient Clinical Summary" }]}
        title="Patient Clinical Summary"
        actions={
          <>
            <input
              type="search"
              placeholder="PhilHealth ID"
              value={philhealth}
              onChange={(e) => setPhilhealth(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              style={{ maxWidth: 200 }}
            />
            <button className="secondary" onClick={load} disabled={loading}>{loading ? "Loading…" : "⟳ Load"}</button>
            <button className="ghost" onClick={reset}>Reset</button>
            <label className="dash-auto" style={{ color: "var(--muted)" }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-refresh (30s)
            </label>
            <span className="muted" style={{ fontSize: 12 }}>{stamp}</span>
          </>
        }
      />
      <p className="sub">
        PH Core IG v0.2.0 · Track 2 · single-patient encounter record · read-only view ·{" "}
        <span className="muted">{server.name} · <code>{baseUrl}</code></span>
      </p>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="dash-wrap">
        <main className="dash-main">
          {patient && (
            <section className="dash-patient">
              <div className="avatar">{(initials(name) || "?").toUpperCase()}</div>
              <div className="pmain">
                <h2>{name}</h2>
                <div className="chips">
                  <span className="dash-chip"><b>Sex</b>{sex}</span>
                  <span className="dash-chip"><b>Age</b>{ageFrom(patient.birthDate) || "—"}</span>
                  <span className="dash-chip"><b>Born</b>{patient.birthDate || "—"}</span>
                  <span className="dash-chip"><b>PhilHealth</b>{idValue(patient, "philhealth") || "—"}</span>
                  <span className="dash-chip"><b>PhilSys</b>{idValue(patient, "philsys") || "—"}</span>
                  <span className="dash-chip"><b>Address</b>{addressText(patient) || "—"}</span>
                </div>
                <div className="encline">
                  {latestEncLine ? (
                    <><b>Latest encounter:</b> {latestEncLine.cls || "visit"}{latestEncLine.facility ? " · " + latestEncLine.facility : ""}{latestEncLine.per ? " · " + latestEncLine.per : ""}{latestEncLine.attending ? " · " + latestEncLine.attending : ""} · <b>status</b> {latestEncLine.status || "—"}</>
                  ) : "No encounters recorded yet."}
                </div>
              </div>
            </section>
          )}

          <section className="dash-kpis">
            <div className="dash-kpi"><div className="bar" /><div className="v">{mine.encs.length}</div><div className="l">Encounters</div></div>
            <div className="dash-kpi k-dx"><div className="bar" /><div className="v">{mine.conds.length}</div><div className="l">Diagnoses</div></div>
            <div className="dash-kpi k-obs"><div className="bar" /><div className="v">{mine.obs.length}</div><div className="l">Observations</div></div>
            <div className="dash-kpi k-proc"><div className="bar" /><div className="v">{mine.procs.length}</div><div className="l">Procedures</div></div>
            <div className="dash-kpi k-bp"><div className="bar" /><div className="v">{latestBp}</div><div className="l">Latest BP</div></div>
          </section>

          <div className="dash-grid2">
            <section className="dash-card">
              <h2>🩺 Diagnoses (Conditions) <span className="count">{mine.conds.length} total</span></h2>
              <div className="dash-tablewrap">
                <table className="dash-table">
                  <thead><tr><th>Diagnosis</th><th>Category</th><th>Severity</th><th>Recorded</th><th>Status</th></tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5}><div className="dash-loading"><div className="dash-spinner" />Querying FHIR server…</div></td></tr>
                    ) : error ? (
                      <tr><td colSpan={5}><div className="dash-error">⚠ {error}</div></td></tr>
                    ) : !patient ? (
                      <tr><td colSpan={5}><div className="dash-empty">No patient found for PhilHealth ID <code>{philhealth.trim()}</code>. Submit Track 2 Folder 1 / Folder 2 first, or check the Base URL.</div></td></tr>
                    ) : dxRows.length === 0 ? (
                      <tr><td colSpan={5}><div className="dash-empty">No diagnoses recorded.</div></td></tr>
                    ) : (
                      dxRows.map((c) => {
                        const sev = severityBand(c);
                        const ver = verStatus(c);
                        return (
                          <tr key={c.id}>
                            <td><div className="dash-pname">{ccText(c.code)}</div>{ver ? <div className="dash-sub">{ver}</div> : null}</td>
                            <td>{ccText(c.category?.[0])}</td>
                            <td>{sev ? <span className={`dash-sev ${sev}`}>{sev}</span> : "—"}</td>
                            <td>{fmtDate(c.recordedDate || c.onsetDateTime)}</td>
                            <td>{statusPill(clinStatus(c))}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-legend">From <code>Condition</code> resources where <code>subject</code> is this patient.</div>
            </section>

            <section className="dash-card">
              <h2>📈 Vitals &amp; labs (Observations) <span className="count">{mine.obs.length} total</span></h2>
              <div className="dash-tablewrap">
                <table className="dash-table">
                  <thead><tr><th>Test</th><th>Value</th><th>Category</th><th>When</th></tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4}><div className="dash-loading"><div className="dash-spinner" />Querying FHIR server…</div></td></tr>
                    ) : error ? (
                      <tr><td colSpan={4}><div className="dash-error">⚠ {error}</div></td></tr>
                    ) : !patient ? (
                      <tr><td colSpan={4}><div className="dash-empty">—</div></td></tr>
                    ) : obsRows.length === 0 ? (
                      <tr><td colSpan={4}><div className="dash-empty">No observations recorded.</div></td></tr>
                    ) : (
                      obsRows.map((o) => (
                        <tr key={o.id}>
                          <td><div className="dash-pname">{ccText(o.code)}</div></td>
                          <td><span className="dash-val">{obsValue(o)}</span></td>
                          <td>{obsCategory(o)}</td>
                          <td>{fmtDate(o.effectiveDateTime)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-legend">From <code>Observation</code> resources for this patient (vital-signs + laboratory).</div>
            </section>
          </div>
        </main>
      </div>

    </div>
  );
}
