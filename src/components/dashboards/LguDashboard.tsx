"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppPageHeader from "@/components/AppPageHeader";
import { useSettings } from "@/lib/settings-context";
import type { Bundle, FhirResource, Patient, ServiceRequest, Task } from "fhir/r4";
import { ccText, fmtDate, patientId, patientName } from "./shared";

const STATUSES = [
  { key: "requested", label: "Requested", color: "var(--dash-active)" },
  { key: "received", label: "Received", color: "var(--dash-received)" },
  { key: "accepted", label: "Accepted", color: "var(--dash-accepted)" },
  { key: "in-progress", label: "In-progress", color: "var(--dash-in-progress)" },
  { key: "completed", label: "Completed", color: "var(--dash-completed)" },
  { key: "rejected", label: "Rejected", color: "var(--dash-rejected)" },
];
const COLOR = Object.fromEntries(STATUSES.map((s) => [s.key, s.color]));

function performerText(sr: ServiceRequest): string {
  const perf = (sr.performer || [])[0];
  if (!perf) return "—";
  return perf.display || (perf.identifier ? "NHFR " + perf.identifier.value : perf.reference) || "—";
}

function statusPill(status: string): JSX.Element {
  const c = COLOR[status] || "var(--dash-unknown)";
  const label = status ? status.replace("-", " ") : "no task";
  return (
    <span className="dash-pill" style={{ background: c + "1a", color: c }}>
      <span className="dot" style={{ background: c }} />
      {label}
    </span>
  );
}

export default function LguDashboard() {
  const { baseUrl, server } = useSettings();
  const [reason, setReason] = useState("398254007");
  const [category, setCategory] = useState("73770003");
  const [facility, setFacility] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [bundle, setBundle] = useState<Bundle<FhirResource> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState("—");

  const buildUrl = useCallback(() => {
    const base = baseUrl.replace(/\/+$/, "");
    const p = new URLSearchParams();
    p.append("_include", "ServiceRequest:subject");
    p.append("_revinclude", "Task:focus");
    p.append("_count", "100");
    p.append("_sort", "-authored");
    if (category) p.append("category", category);
    if (facility.trim()) p.append("performer.identifier", "https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code|" + facility.trim());
    if (dateFrom) p.append("authored", "ge" + dateFrom);
    if (dateTo) p.append("authored", "le" + dateTo);
    return base + "/ServiceRequest?" + p.toString();
  }, [baseUrl, category, facility, dateFrom, dateTo]);

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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  useEffect(() => {
    load();
  }, [reason, category, load]);

  const rows = useMemo(() => {
    if (!bundle) return null;
    const entries = (bundle.entry || []).map((e) => e.resource).filter(Boolean) as FhirResource[];
    let srs = entries.filter((r) => r.resourceType === "ServiceRequest") as ServiceRequest[];
    if (reason) {
      srs = srs.filter((sr) =>
        (sr.reasonCode || []).some((cc) => (cc.coding || []).some((c) => c.code === reason))
      );
    }
    const pats: Record<string, Patient> = {};
    entries.filter((r) => r.resourceType === "Patient").forEach((p) => (pats[p.id!] = p as Patient));
    const tasks = entries.filter((r) => r.resourceType === "Task") as Task[];

    const taskBySr: Record<string, Task> = {};
    tasks.forEach((t) => {
      const ref = t.focus?.reference;
      if (!ref) return;
      const srId = ref.split("/").pop();
      if (!srId) return;
      const prev = taskBySr[srId];
      if (!prev || new Date(t.lastModified || t.authoredOn || 0) >= new Date(prev.lastModified || prev.authoredOn || 0)) {
        taskBySr[srId] = t;
      }
    });

    return { srs, pats, taskBySr, total: bundle.total };
  }, [bundle, reason]);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s.key, 0])) as Record<string, number>;
    if (!rows) return counts;
    Object.values(rows.taskBySr).forEach((t) => {
      if (counts[t.status || ""] != null) counts[t.status || ""]++;
    });
    return counts;
  }, [rows]);

  const kpis = useMemo(() => {
    if (!rows) return { total: 0, pending: 0, inCare: 0, completed: 0, rate: "—" };
    const total = rows.srs.length;
    const pending = statusCounts.requested + statusCounts.received;
    const inCare = statusCounts.accepted + statusCounts["in-progress"];
    const engaged = statusCounts.accepted + statusCounts["in-progress"] + statusCounts.completed;
    const decided = engaged + statusCounts.rejected;
    return {
      total,
      pending,
      inCare,
      completed: statusCounts.completed,
      rate: decided ? Math.round((engaged / decided) * 100) + "%" : "—",
    };
  }, [rows, statusCounts]);

  const maxStatus = Math.max(1, ...Object.values(statusCounts));

  function reset() {
    setReason("398254007");
    setCategory("73770003");
    setFacility("");
    setDateFrom("");
    setDateTo("");
    load();
  }

  return (
    <div className="dashboard dashboard-lgu">
      <AppPageHeader
        items={[{ label: "Home", href: "/" }, { label: "LGU Referral Dashboard" }]}
        title="LGU Referral Dashboard"
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
      <p className="sub">Provincial Health Office — Aklan · PH eReferral (PeReF) · read-only PHO view</p>

      {error && <div className="alert err">❌ {error}</div>}

      <div className="dash-wrap">
        <section className="dash-controls">
          <div className="dash-field">
            <label>FHIR server</label>
            <div className="dash-server">{server.name} · <code>{baseUrl}</code></div>
          </div>
          <div className="dash-field">
            <label htmlFor="reason">Reason (SNOMED)</label>
            <select id="reason" value={reason} onChange={(e) => { setReason(e.target.value); }}>
              <option value="">All reasons</option>
              <option value="398254007">398254007 — Pre-eclampsia</option>
              <option value="71388002">71388002 — Procedure</option>
              <option value="22298006">22298006 — Myocardial infarction</option>
            </select>
          </div>
          <div className="dash-field">
            <label htmlFor="category">Category (SNOMED)</label>
            <select id="category" value={category} onChange={(e) => { setCategory(e.target.value); }}>
              <option value="">All categories</option>
              <option value="73770003">73770003 — Emergency</option>
              <option value="50849002">50849002 — Emergency room admission</option>
            </select>
          </div>
          <div className="dash-field">
            <label htmlFor="facility">Receiving facility (NHFR)</label>
            <input id="facility" placeholder="e.g. 513" value={facility} onChange={(e) => setFacility(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <div className="dash-field">
            <label htmlFor="dateFrom">Authored from</label>
            <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="dash-field">
            <label htmlFor="dateTo">Authored to</label>
            <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </section>

        <main className="dash-main">
          <section className="dash-kpis">
            <div className="dash-kpi"><div className="bar" /><div className="v">{kpis.total}</div><div className="l">Total referrals</div></div>
            <div className="dash-kpi k-pending"><div className="bar" /><div className="v">{kpis.pending}</div><div className="l">Awaiting action</div></div>
            <div className="dash-kpi k-accept"><div className="bar" /><div className="v">{kpis.inCare}</div><div className="l">Accepted / in care</div></div>
            <div className="dash-kpi"><div className="bar" /><div className="v">{kpis.completed}</div><div className="l">Completed</div></div>
            <div className="dash-kpi k-rate"><div className="bar" /><div className="v">{kpis.rate}</div><div className="l">Acceptance rate</div></div>
          </section>

          <div className="dash-grid2">
            <section className="dash-card">
              <h2>📋 Referrals <span className="count">{rows ? rows.srs.length + (rows.total != null ? " of " + rows.total : "") + " shown" : ""}</span></h2>
              <div className="dash-tablewrap">
                <table className="dash-table">
                  <thead>
                    <tr><th>Patient</th><th>Reason</th><th>Priority</th><th>Authored</th><th>Receiving facility</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6}><div className="dash-loading"><div className="dash-spinner" />Querying FHIR server…</div></td></tr>
                    ) : error ? (
                      <tr><td colSpan={6}><div className="dash-error">⚠ {error}</div></td></tr>
                    ) : !rows ? (
                      <tr><td colSpan={6}><div className="dash-loading"><div className="dash-spinner" />Loading referrals…</div></td></tr>
                    ) : rows.srs.length === 0 ? (
                      <tr><td colSpan={6}><div className="dash-empty">No referrals match the current filter.</div></td></tr>
                    ) : (
                      rows.srs.map((sr) => {
                        const pid = sr.subject?.reference?.split("/").pop();
                        const pat = pid ? rows.pats[pid] : undefined;
                        const task = rows.taskBySr[sr.id || ""];
                        const status = task ? task.status : (sr.status === "active" ? "requested" : sr.status);
                        const prio = sr.priority || "routine";
                        return (
                          <tr key={sr.id}>
                            <td><div className="dash-pname">{patientName(pat)}</div><div className="dash-sub">{patientId(pat)}</div></td>
                            <td>{ccText((sr.reasonCode && sr.reasonCode[0]) || sr.code)}<div className="dash-sub">{ccText(sr.category && sr.category[0])}</div></td>
                            <td><span className={`dash-prio ${prio}`}>{prio}</span></td>
                            <td>{fmtDate(sr.authoredOn)}</td>
                            <td>{performerText(sr)}</td>
                            <td>{statusPill(status || "")}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-legend">Status is read from the referral <code>Task</code>; rows without a Task fall back to the <code>ServiceRequest.status</code>.</div>
            </section>

            <section className="dash-card">
              <h2>📊 Referrals by status</h2>
              <div className="body">
                <div className="dash-statusbars">
                  {loading || error || !rows ? (
                    <div className="dash-loading"><div className="dash-spinner" />{error ? error : "Loading…"}</div>
                  ) : (
                    STATUSES.map((s) => {
                      const n = statusCounts[s.key];
                      const pct = Math.round((n / maxStatus) * 100);
                      return (
                        <div className="dash-sb" key={s.key}>
                          <div className="name"><span className="dash-dot" style={{ background: s.color }} />{s.label}</div>
                          <div className="dash-track"><div className="dash-fill" style={{ width: pct + "%", background: s.color }} /></div>
                          <div className="num">{n}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="dash-legend">Counts from referral <code>Task.status</code> across the current filter.</div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
