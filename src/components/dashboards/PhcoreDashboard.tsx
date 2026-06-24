"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppPageHeader from "@/components/AppPageHeader";
import { buildFhirBaseUrl, getServerById } from "@/lib/settings";
import type { Bundle, Condition, Encounter, FhirResource, Patient } from "fhir/r4";
import { ccText, clinStatus, escapeHtml, facilityCode, fmtDate, patientId, patientName, reasonKey, resSummary, severityBand, verStatus } from "./shared";

const STATUSES = [
  { key: "active", label: "Active", color: "var(--dash-active)" },
  { key: "recurrence", label: "Recurrence", color: "var(--dash-recurrence)" },
  { key: "relapse", label: "Relapse", color: "var(--dash-relapse)" },
  { key: "inactive", label: "Inactive", color: "var(--dash-inactive)" },
  { key: "remission", label: "Remission", color: "var(--dash-remission)" },
  { key: "resolved", label: "Resolved", color: "var(--dash-resolved)" },
];
const COLOR: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.key, s.color]));
const REASON_COLORS = ["#4338ca", "#0891b2", "#db2777", "#d97706", "#16a34a", "#7c3aed", "#0d9488", "#dc2626", "#2563eb", "#94a3b8"];
const SNOMED = "http://snomed.info/sct";

const REC_INCLUDES = [
  "_revinclude=Encounter:subject",
  "_revinclude=Condition:subject",
  "_revinclude=Observation:subject",
  "_revinclude=Procedure:subject",
  "_revinclude=DiagnosticReport:subject",
  "_include:iterate=Encounter:service-provider",
  "_include:iterate=Encounter:participant",
  "_include:iterate=PractitionerRole:practitioner",
  "_include:iterate=PractitionerRole:organization",
].join("&");

function statusPill(s: string): JSX.Element {
  const c = COLOR[s] || "var(--dash-unknown)";
  return (
    <span className="dash-pill" style={{ background: c + "1a", color: c }}>
      <span className="dot" style={{ background: c }} />
      {s || "unknown"}
    </span>
  );
}

const PHCORE_SERVER = getServerById("phcore")!;
const PHCORE_BASE_URL = buildFhirBaseUrl(PHCORE_SERVER);

export default function PhcoreDashboard() {
  const server = PHCORE_SERVER;
  const baseUrl = PHCORE_BASE_URL;
  const [reason, setReason] = useState("401303003");
  const [category, setCategory] = useState("encounter-diagnosis");
  const [facility, setFacility] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [bundle, setBundle] = useState<Bundle<FhirResource> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState("—");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalPid, setModalPid] = useState<string | null>(null);
  const [modalBundle, setModalBundle] = useState<Bundle<FhirResource> | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const buildUrl = useCallback(() => {
    const base = baseUrl.replace(/\/+$/, "");
    const p = new URLSearchParams();
    p.append("_include", "Condition:subject");
    p.append("_include", "Condition:encounter");
    p.append("_count", "100");
    p.append("_sort", "-recorded-date");
    if (category) p.append("category", category);
    if (reason) p.append("code", SNOMED + "|" + reason);
    if (dateFrom) p.append("recorded-date", "ge" + dateFrom);
    if (dateTo) p.append("recorded-date", "le" + dateTo);
    return base + "/Condition?" + p.toString();
  }, [baseUrl, category, reason, dateFrom, dateTo]);

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
  useEffect(() => { load(); }, [reason, category, load]);

  const rows = useMemo(() => {
    if (!bundle) return null;
    const entries = (bundle.entry || []).map((e) => e.resource).filter(Boolean) as FhirResource[];
    let conds = entries.filter((r) => r.resourceType === "Condition") as Condition[];
    const pats: Record<string, Patient> = {};
    entries.filter((r) => r.resourceType === "Patient").forEach((p) => (pats[p.id!] = p as Patient));
    const encs: Record<string, Encounter> = {};
    entries.filter((r) => r.resourceType === "Encounter").forEach((e) => (encs[e.id!] = e as Encounter));

    if (facility.trim()) {
      conds = conds.filter((c) => {
        const encId = c.encounter?.reference?.split("/").pop();
        return encId && facilityCode(encs[encId]) === facility.trim();
      });
    }
    return { conds, pats, encs, total: bundle.total };
  }, [bundle, facility]);

  const reasonRows = useMemo(() => {
    if (!rows) return [];
    const counts: Record<string, number> = {};
    rows.conds.forEach((c) => { const k = reasonKey(c); counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const maxReason = Math.max(1, ...reasonRows.map((r) => r[1]));

  const kpis = useMemo(() => {
    if (!rows) return { total: 0, active: 0, severe: 0, confirmed: 0, rate: "—" };
    const total = rows.conds.length;
    const active = rows.conds.filter((c) => clinStatus(c) === "active").length;
    const severe = rows.conds.filter((c) => severityBand(c) === "severe").length;
    const confirmed = rows.conds.filter((c) => verStatus(c) === "confirmed").length;
    return { total, active, severe, confirmed, rate: total ? Math.round((confirmed / total) * 100) + "%" : "—" };
  }, [rows]);

  function reset() {
    setReason("401303003");
    setCategory("encounter-diagnosis");
    setFacility("");
    setDateFrom("");
    setDateTo("");
    load();
  }

  async function openRecord(pid: string) {
    if (!pid) return;
    setModalOpen(true);
    setModalPid(pid);
    setModalLoading(true);
    setModalError(null);
    setModalBundle(null);
    try {
      const base = baseUrl.replace(/\/+$/, "");
      const url = `${base}/Patient?_id=${encodeURIComponent(pid)}&${REC_INCLUDES}`;
      const res = await fetch(url, { headers: { Accept: "application/fhir+json" } });
      if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
      const data: Bundle<FhirResource> = await res.json();
      setModalBundle(data);
    } catch (err) {
      const msg = err instanceof Error && /Failed to fetch/.test(err.message)
        ? "Could not reach the FHIR server (network or CORS)." : err instanceof Error ? err.message : "Unknown error";
      setModalError(msg);
    } finally {
      setModalLoading(false);
    }
  }

  function closeRecord() {
    setModalOpen(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeRecord(); }
    if (modalOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const modalPatient = useMemo(() => {
    if (!modalBundle) return null;
    return ((modalBundle.entry || []).map((e) => e.resource).filter(Boolean) as FhirResource[]).find((r) => r.resourceType === "Patient");
  }, [modalBundle]);

  const modalSections = useMemo(() => {
    if (!modalBundle) return [];
    const resources = (modalBundle.entry || []).map((e) => e.resource).filter(Boolean) as FhirResource[];
    const order = ["Patient", "Encounter", "Condition", "Observation", "Procedure", "DiagnosticReport", "PractitionerRole", "Practitioner", "Organization"];
    const byType: Record<string, FhirResource[]> = {};
    resources.forEach((r) => { (byType[r.resourceType] = byType[r.resourceType] || []).push(r); });
    return [...order.filter((t) => byType[t]), ...Object.keys(byType).filter((t) => !order.includes(t))].map((t) => ({ type: t, list: byType[t] }));
  }, [modalBundle]);

  return (
    <div className="dashboard dashboard-phcore">
      <AppPageHeader
        items={[{ label: "Home", href: "/" }, { label: "PH Core Rate Report" }]}
        title="PH Core Encounter Records — Rate Report"
        actions={
          <>
            <button className="secondary" onClick={load} disabled={loading}>{loading ? "Loading…" : "⟳ Refresh"}</button>
            <button className="ghost" onClick={reset}>Reset filters</button>
            <label className="dash-auto" style={{ color: "var(--muted)" }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-refresh (30s)
            </label>
            <span className="muted" style={{ fontSize: 12 }}>{stamp}</span>
          </>
        }
      />
      <p className="sub">PH Core IG v0.2.0 · Track 2 · rate report by Referral Category &amp; Reason for Referral · read-only view</p>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="dash-wrap">
        <section className="dash-controls">
          <div className="dash-field">
            <label>FHIR server</label>
            <div className="dash-server">{server.name} · <code>{baseUrl}</code></div>
          </div>
          <div className="dash-field">
            <label htmlFor="reason">Reason for Referral (SNOMED · Condition.code)</label>
            <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">All reasons</option>
              <option value="401303003">401303003 — Acute STEMI</option>
              <option value="401314000">401314000 — Acute NSTEMI</option>
              <option value="22298006">22298006 — Myocardial infarction</option>
              <option value="194828000">194828000 — Angina</option>
              <option value="398254007">398254007 — Pre-eclampsia</option>
            </select>
          </div>
          <div className="dash-field">
            <label htmlFor="category">Referral Category (Condition.category)</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              <option value="encounter-diagnosis">encounter-diagnosis</option>
              <option value="problem-list-item">problem-list-item</option>
            </select>
          </div>
          <div className="dash-field">
            <label htmlFor="facility">Facility (NHFR code)</label>
            <input id="facility" placeholder="e.g. 12345678" value={facility} onChange={(e) => setFacility(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <div className="dash-field">
            <label htmlFor="dateFrom">Recorded from</label>
            <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="dash-field">
            <label htmlFor="dateTo">Recorded to</label>
            <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </section>

        <main className="dash-main">
          <section className="dash-kpis">
            <div className="dash-kpi"><div className="bar" /><div className="v">{kpis.total}</div><div className="l">Total cases</div></div>
            <div className="dash-kpi k-active"><div className="bar" /><div className="v">{kpis.active}</div><div className="l">Active</div></div>
            <div className="dash-kpi k-severe"><div className="bar" /><div className="v">{kpis.severe}</div><div className="l">Severe</div></div>
            <div className="dash-kpi k-conf"><div className="bar" /><div className="v">{kpis.confirmed}</div><div className="l">Confirmed</div></div>
            <div className="dash-kpi k-rate"><div className="bar" /><div className="v">{kpis.rate}</div><div className="l">Confirmation rate</div></div>
          </section>

          <div className="dash-grid2">
            <section className="dash-card">
              <h2>📋 Encounter records <span className="count">{rows ? rows.conds.length + (rows.total != null ? " of " + rows.total : "") + " shown" : ""}</span></h2>
              <div className="dash-tablewrap">
                <table className="dash-table">
                  <thead><tr><th>Patient</th><th>Reason (diagnosis)</th><th>Category</th><th>Severity</th><th>Recorded</th><th>Status</th></tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6}><div className="dash-loading"><div className="dash-spinner" />Querying FHIR server…</div></td></tr>
                    ) : error ? (
                      <tr><td colSpan={6}><div className="dash-error">⚠ {error}</div></td></tr>
                    ) : !rows ? (
                      <tr><td colSpan={6}><div className="dash-loading"><div className="dash-spinner" />Loading records…</div></td></tr>
                    ) : rows.conds.length === 0 ? (
                      <tr><td colSpan={6}><div className="dash-empty">No encounter records match the current filter.</div></td></tr>
                    ) : (
                      rows.conds.map((c) => {
                        const pid = c.subject?.reference?.split("/").pop();
                        const pat = pid ? rows.pats[pid] : undefined;
                        const sev = severityBand(c);
                        const ver = verStatus(c);
                        return (
                          <tr key={c.id} className="rowlink" onClick={() => { if (pid) openRecord(pid); }} title="View full referral details">
                            <td><div className="dash-pname">{patientName(pat)}</div><div className="dash-sub">{patientId(pat)}</div></td>
                            <td>{ccText(c.code)}{ver ? <div className="dash-sub">{ver}</div> : null}</td>
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
              <div className="dash-legend">One row per <code>Condition</code> (the encounter diagnosis). <strong>Click any row</strong> to view the full referral details. Patient and Encounter are pulled via <code>_include</code>.</div>
            </section>

            <section className="dash-card">
              <h2>📊 Cases by reason</h2>
              <div className="body">
                <div className="dash-statusbars">
                  {loading || error || !rows ? (
                    <div className="dash-loading"><div className="dash-spinner" />{error ? error : "Loading…"}</div>
                  ) : reasonRows.length === 0 ? (
                    <div className="dash-empty">No data.</div>
                  ) : (
                    reasonRows.map(([name, n], i) => {
                      const color = REASON_COLORS[i % REASON_COLORS.length];
                      const pct = Math.round((n / maxReason) * 100);
                      return (
                        <div className="dash-sb" key={name}>
                          <div className="name"><span className="dash-dot" style={{ background: color }} />{name}</div>
                          <div className="dash-track"><div className="dash-fill" style={{ width: pct + "%", background: color }} /></div>
                          <div className="num">{n}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="dash-legend">Rate of cases grouped by <code>Condition.code</code> across the current filter.</div>
            </section>
          </div>
        </main>
      </div>

      {modalOpen && (
        <div className="dash-modal-overlay" onClick={(e) => { if (e.currentTarget === e.target) closeRecord(); }}>
          <div className="dash-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="recTitle">
            <header>
              <div>
                <h3 id="recTitle">{modalPatient ? patientName(modalPatient) : "Full referral details"}</h3>
                <div className="sub">{modalPatient ? patientId(modalPatient) : modalPid ? modalPid : "—"}</div>
              </div>
              <button className="x" onClick={closeRecord} aria-label="Close">×</button>
            </header>
            <div className="dash-modal-body">
              {modalLoading ? (
                <div className="dash-loading"><div className="dash-spinner" />Pulling the complete record…</div>
              ) : modalError ? (
                <div className="dash-error">⚠ {modalError}</div>
              ) : (
                modalSections.map(({ type, list }) => (
                  <div className="dash-recsec" key={type}>
                    <p className="sectitle">{type} <span className="badge">{list.length}</span></p>
                    {list.map((r) => {
                      const s = resSummary(r);
                      const meta = (s.m || []).filter((x): x is string => Boolean(x) && x !== "—").map((x, i) => <span key={i}>{escapeHtml(x)}</span>);
                      return (
                        <div className="dash-rescard" key={r.id}>
                          <div className="rt">{escapeHtml(s.t)}</div>
                          {meta.length ? <div className="rmeta">{meta}</div> : null}
                          <details>
                            <summary>Raw JSON</summary>
                            <pre>{escapeHtml(JSON.stringify(r, null, 2))}</pre>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
