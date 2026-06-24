"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppPageHeader from "@/components/AppPageHeader";
import { useSettings } from "@/lib/settings-context";
import type { Bundle, Condition, Encounter, FhirResource, Observation, Patient, Practitioner, Procedure, ServiceRequest, Task } from "fhir/r4";
import { addressText, ageFrom, ccText, clinStatus, fmtDate, idValue, initials, obsCategory, obsValue, patientName, practName, severityBand, verStatus } from "./shared";

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

const SR_STATUS_COLOR: Record<string, string> = {
  active: "var(--dash-active)",
  completed: "var(--dash-resolved)",
  "on-hold": "#d97706",
  draft: "var(--dash-muted)",
  revoked: "var(--dash-rejected)",
  "entered-in-error": "var(--dash-rejected)",
  unknown: "var(--dash-muted)",
};

type Ref = { reference?: string; display?: string };
type RoleLite = {
  practitioner?: Ref;
  organization?: Ref;
  code?: Array<{ text?: string; coding?: Array<{ display?: string; code?: string }> }>;
};
type OrgLite = { name?: string };
type RoleLine = { name: string; role: string };

function statusPill(s: string, palette: Record<string, string> = STATUS_COLOR): JSX.Element {
  const c = palette[s] || "var(--dash-unknown)";
  return (
    <span className="dash-pill" style={{ background: c + "1a", color: c }}>
      <span className="dot" style={{ background: c }} />
      {s || "unknown"}
    </span>
  );
}

function refTail(ref?: Ref): string {
  return ref?.reference?.split("/").pop() || "";
}

function encounterIdOf(r: FhirResource): string {
  return refTail((r as { encounter?: Ref }).encounter);
}

// Resolve a requester/performer reference to a display name + role designation.
function roleInfo(ref: Ref | undefined, roles: Record<string, RoleLite>, pracs: Record<string, Practitioner>): RoleLine | null {
  if (!ref?.reference) return ref?.display ? { name: ref.display, role: "" } : null;
  const id = refTail(ref);
  if (ref.reference.includes("PractitionerRole/")) {
    const role = roles[id];
    if (!role) return { name: ref.display || "—", role: "" };
    let name = role.practitioner?.display || "";
    if (!name) {
      const p = pracs[refTail(role.practitioner)];
      name = p ? practName(p) : "";
    }
    const rc = role.code?.[0] ? ccText(role.code[0]) : "";
    return { name: name || ref.display || "—", role: rc !== "—" ? rc : "" };
  }
  if (ref.reference.includes("Practitioner/")) {
    const p = pracs[id];
    return { name: p ? practName(p) : ref.display || "—", role: "" };
  }
  return { name: ref.display || "—", role: "" };
}

// Receiving organization name from ServiceRequest.performer (Organization directly, or via PractitionerRole.organization).
function performerOrgName(sr: ServiceRequest, orgs: Record<string, OrgLite>, roles: Record<string, RoleLite>): string {
  for (const p of sr.performer || []) {
    const ref = p.reference || "";
    if (ref.includes("Organization/")) {
      const o = orgs[refTail(p)];
      if (o?.name) return o.name;
      if (p.display) return p.display;
    }
    if (ref.includes("PractitionerRole/")) {
      const role = roles[refTail(p)];
      const o = orgs[refTail(role?.organization)];
      if (o?.name) return o.name;
      if (role?.organization?.display) return role.organization.display;
    }
  }
  for (const p of sr.performer || []) if (p.display) return p.display;
  return "—";
}

// Receiving PractitionerRole. Per project rule it lives on Task.owner (Task.focus =
// this ServiceRequest); falls back to a performer that is a PractitionerRole.
function receivingRole(sr: ServiceRequest, tasks: Task[], roles: Record<string, RoleLite>, pracs: Record<string, Practitioner>): RoleLine | null {
  const t = tasks.find((tk) => refTail(tk.focus) === sr.id);
  if (t?.owner && (t.owner.reference || "").includes("PractitionerRole/")) {
    return roleInfo(t.owner, roles, pracs);
  }
  for (const p of sr.performer || []) {
    if ((p.reference || "").includes("PractitionerRole/")) return roleInfo(p, roles, pracs);
  }
  return null;
}

function srTime(sr: ServiceRequest): number {
  return new Date(sr.authoredOn || sr.meta?.lastUpdated || 0).getTime();
}

function roleText(r: RoleLine | null): string {
  if (!r) return "—";
  return r.role ? `${r.name} · ${r.role}` : r.name;
}

export default function PatientDashboard() {
  const { baseUrl, server } = useSettings();
  const [philhealth, setPhilhealth] = useState("78-658064775-3");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [bundle, setBundle] = useState<Bundle<FhirResource> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState("—");
  const [selectedSrId, setSelectedSrId] = useState<string | null>(null);

  const buildUrl = useCallback(() => {
    const base = baseUrl.replace(/\/+$/, "");
    const inc = [
      "_revinclude=ServiceRequest:subject",
      "_revinclude=Task:patient",
      "_revinclude=Encounter:subject",
      "_revinclude=Condition:subject",
      "_revinclude=Observation:subject",
      "_revinclude=Procedure:subject",
      "_revinclude=DiagnosticReport:subject",
      "_include:iterate=ServiceRequest:requester",
      "_include:iterate=ServiceRequest:performer",
      "_include:iterate=ServiceRequest:encounter",
      "_include:iterate=Task:owner",
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
    const empty = { encs: [] as Encounter[], encMap: {} as Record<string, Encounter>, conds: [] as Condition[], obs: [] as Observation[], procs: [] as Procedure[], srs: [] as ServiceRequest[], tasks: [] as Task[], orgs: {} as Record<string, OrgLite>, roles: {} as Record<string, RoleLite>, pracs: {} as Record<string, Practitioner> };
    if (!patient) return empty;
    const pref = "Patient/" + patient.id;
    const isMine = (r: FhirResource) => {
      const s = (r as { subject?: Ref; patient?: Ref; for?: Ref }).subject || (r as { patient?: Ref }).patient || (r as { for?: Ref }).for;
      return s?.reference?.endsWith(pref) || false;
    };
    const encs = resources.filter((r) => r.resourceType === "Encounter" && isMine(r)) as Encounter[];
    const encMap: Record<string, Encounter> = {};
    encs.forEach((e) => (encMap[e.id!] = e));
    const conds = resources.filter((r) => r.resourceType === "Condition" && isMine(r)) as Condition[];
    const obs = resources.filter((r) => r.resourceType === "Observation" && isMine(r)) as Observation[];
    const procs = resources.filter((r) => r.resourceType === "Procedure" && isMine(r)) as Procedure[];
    const srs = (resources.filter((r) => r.resourceType === "ServiceRequest" && isMine(r)) as ServiceRequest[])
      .sort((a, b) => srTime(b) - srTime(a));
    const tasks = resources.filter((r) => r.resourceType === "Task" && isMine(r)) as Task[];
    const orgs: Record<string, OrgLite> = {};
    resources.filter((r) => r.resourceType === "Organization").forEach((o) => (orgs[o.id!] = o as OrgLite));
    const roles: Record<string, RoleLite> = {};
    resources.filter((r) => r.resourceType === "PractitionerRole").forEach((pr) => (roles[pr.id!] = pr as RoleLite));
    const pracs: Record<string, Practitioner> = {};
    resources.filter((r) => r.resourceType === "Practitioner").forEach((p) => (pracs[p.id!] = p as Practitioner));
    return { encs, encMap, conds, obs, procs, srs, tasks, orgs, roles, pracs };
  }, [resources, patient]);

  // Default to the latest referral; keep selection valid across reloads.
  useEffect(() => {
    if (!mine.srs.length) { if (selectedSrId !== null) setSelectedSrId(null); return; }
    if (!selectedSrId || !mine.srs.some((s) => s.id === selectedSrId)) {
      setSelectedSrId(mine.srs[0].id || null);
    }
  }, [mine.srs, selectedSrId]);

  const selectedSr = useMemo(() => mine.srs.find((s) => s.id === selectedSrId) || mine.srs[0] || null, [mine.srs, selectedSrId]);

  // Clinical data scoped to the selected referral: the referral's Encounter, plus anything
  // directly referenced from supportingInfo / reasonReference.
  const scoped = useMemo(() => {
    if (!selectedSr) return { conds: [] as Condition[], obs: [] as Observation[], procs: [] as Procedure[], enc: undefined as Encounter | undefined };
    const encId = refTail(selectedSr.encounter);
    const refIds = new Set(
      [...(selectedSr.supportingInfo || []), ...(selectedSr.reasonReference || [])]
        .map((r) => refTail(r))
        .filter(Boolean)
    );
    const inScope = (r: FhirResource) => {
      const e = encounterIdOf(r);
      return (!!encId && e === encId) || refIds.has(r.id || "");
    };
    return {
      conds: mine.conds.filter(inScope),
      obs: mine.obs.filter(inScope),
      procs: mine.procs.filter(inScope),
      enc: encId ? mine.encMap[encId] : undefined,
    };
  }, [selectedSr, mine]);

  const dxRows = useMemo(() => {
    return [...scoped.conds].sort((a, b) => new Date(b.recordedDate || b.onsetDateTime || 0).getTime() - new Date(a.recordedDate || a.onsetDateTime || 0).getTime());
  }, [scoped]);

  const obsRows = useMemo(() => {
    return [...scoped.obs].sort((a, b) => new Date(b.effectiveDateTime || 0).getTime() - new Date(a.effectiveDateTime || 0).getTime());
  }, [scoped]);

  const latestBp = useMemo(() => {
    const bps = scoped.obs
      .filter((o) => {
        const codes = (o.code?.coding || []).map((c) => c.code);
        return codes.includes("85354-9") || codes.includes("75367002") || (o.component || []).some((c) => (c.code?.coding || []).some((x) => x.code === "8480-6" || x.code === "271649006"));
      })
      .sort((a, b) => new Date(b.effectiveDateTime || 0).getTime() - new Date(a.effectiveDateTime || 0).getTime());
    if (!bps[0]) return "—";
    const comp = bps[0].component || [];
    const sys = comp.find((c) => (c.code?.coding || []).some((x) => x.code === "8480-6" || x.code === "271649006"))?.valueQuantity;
    const dia = comp.find((c) => (c.code?.coding || []).some((x) => x.code === "8462-4" || x.code === "271650006"))?.valueQuantity;
    return sys && dia ? `${sys.value}/${dia.value}` : obsValue(bps[0]);
  }, [scoped]);

  const encLine = useMemo(() => {
    const enc = scoped.enc;
    if (!enc) return null;
    const cls = enc.class?.display || enc.class?.code || "";
    const sp = enc.serviceProvider;
    let facility = sp?.display || "";
    if (!facility && sp?.reference) facility = mine.orgs[refTail(sp)]?.name || "";
    const per = enc.period ? [fmtDate(enc.period.start), enc.period.end ? fmtDate(enc.period.end) : ""].filter(Boolean).join(" → ") : "";
    let attending = "";
    const part = enc.participant?.[0];
    if (part?.individual?.reference) {
      attending = part.individual.display || "";
      if (!attending) {
        const role = mine.roles[refTail(part.individual)];
        if (role?.practitioner) attending = role.practitioner.display || "";
      }
    }
    return { cls, facility, per, attending, status: enc.status };
  }, [scoped, mine]);

  const selDate = selectedSr ? fmtDate(selectedSr.authoredOn) : "";

  const name = patient ? patientName(patient) : "";
  const sex = patient?.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : "—";

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
        PH Core IG v0.2.0 · Track 2 · single-patient referral record · read-only view ·{" "}
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
                  {encLine ? (
                    <><b>Referral encounter:</b> {encLine.cls || "visit"}{encLine.facility ? " · " + encLine.facility : ""}{encLine.per ? " · " + encLine.per : ""}{encLine.attending ? " · " + encLine.attending : ""} · <b>status</b> {encLine.status || "—"}</>
                  ) : selectedSr ? "Selected referral has no linked encounter." : "No referrals recorded yet."}
                </div>
              </div>
            </section>
          )}

          <section className="dash-kpis">
            <div className="dash-kpi"><div className="bar" /><div className="v">{mine.srs.length}</div><div className="l">Referrals</div></div>
            <div className="dash-kpi k-dx"><div className="bar" /><div className="v">{scoped.conds.length}</div><div className="l">Diagnoses</div></div>
            <div className="dash-kpi k-obs"><div className="bar" /><div className="v">{scoped.obs.length}</div><div className="l">Observations</div></div>
            <div className="dash-kpi k-proc"><div className="bar" /><div className="v">{scoped.procs.length}</div><div className="l">Procedures</div></div>
            <div className="dash-kpi k-bp"><div className="bar" /><div className="v">{latestBp}</div><div className="l">Latest BP</div></div>
          </section>

          <section className="dash-card">
            <h2>📨 Referrals
              <span className="count">{mine.srs.length} total{selectedSr ? ` · viewing ${selDate}` : ""}</span>
            </h2>
            <div className="dash-reflist">
              {loading ? (
                <div className="dash-loading"><div className="dash-spinner" />Querying FHIR server…</div>
              ) : !patient ? (
                <div className="dash-empty">No patient found for PhilHealth ID <code>{philhealth.trim()}</code>.</div>
              ) : mine.srs.length === 0 ? (
                <div className="dash-empty">No referrals (ServiceRequest) recorded for this patient.</div>
              ) : (
                mine.srs.map((sr, i) => {
                  const sel = sr.id === (selectedSr?.id ?? null);
                  const org = performerOrgName(sr, mine.orgs, mine.roles);
                  const refer = roleInfo(sr.requester, mine.roles, mine.pracs);
                  const recv = receivingRole(sr, mine.tasks, mine.roles, mine.pracs);
                  return (
                    <button key={sr.id} type="button" className={"dash-refitem" + (sel ? " sel" : "")} onClick={() => setSelectedSrId(sr.id!)}>
                      <div className="ri-top">
                        <span className="ri-date">{fmtDate(sr.authoredOn)}</span>
                        {i === 0 && <span className="ri-latest">Latest</span>}
                        {sel && i !== 0 && <span className="ri-latest sel">Viewing</span>}
                        {statusPill(sr.status || "unknown", SR_STATUS_COLOR)}
                      </div>
                      <div className="ri-org"><b>To</b> {org}</div>
                      <div className="ri-role"><b>Referred by</b> {roleText(refer)}</div>
                      {recv && <div className="ri-role"><b>Receiving</b> {roleText(recv)}</div>}
                    </button>
                  );
                })
              )}
            </div>
            <div className="dash-legend">From <code>ServiceRequest</code> where <code>subject</code> is this patient — newest first; the latest renders by default, select any to view its clinical summary. <b>To</b> = <code>performer</code> → Organization · <b>Referred by</b> = <code>requester</code> PractitionerRole · <b>Receiving</b> = <code>performer</code> PractitionerRole.</div>
          </section>

          <div className="dash-grid2">
            <section className="dash-card">
              <h2>🩺 Diagnoses (Conditions) <span className="count">{scoped.conds.length} in this referral</span></h2>
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
                    ) : !selectedSr ? (
                      <tr><td colSpan={5}><div className="dash-empty">No referral selected.</div></td></tr>
                    ) : dxRows.length === 0 ? (
                      <tr><td colSpan={5}><div className="dash-empty">No diagnoses linked to this referral.</div></td></tr>
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
              <div className="dash-legend"><code>Condition</code> linked to the selected referral via <code>ServiceRequest.encounter</code> or <code>supportingInfo</code>/<code>reasonReference</code>.</div>
            </section>

            <section className="dash-card">
              <h2>📈 Vitals &amp; labs (Observations) <span className="count">{scoped.obs.length} in this referral</span></h2>
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
                    ) : !selectedSr ? (
                      <tr><td colSpan={4}><div className="dash-empty">No referral selected.</div></td></tr>
                    ) : obsRows.length === 0 ? (
                      <tr><td colSpan={4}><div className="dash-empty">No observations linked to this referral.</div></td></tr>
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
              <div className="dash-legend"><code>Observation</code> linked to the selected referral via <code>ServiceRequest.encounter</code> or <code>supportingInfo</code>.</div>
            </section>
          </div>
        </main>
      </div>

    </div>
  );
}
