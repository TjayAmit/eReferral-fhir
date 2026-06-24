"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppPageHeader from "@/components/AppPageHeader";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { humanName, formatAddress, firstPhone } from "@/lib/referral";

type Detail = {
  serviceRequest: any | null;
  patient: any | null;
  encounter: any | null;
  observations: any[];
  conditions: any[];
  procedures: any[];
  diagnosticReports?: any[];
};

const idVal = (res: any, kind: string) =>
  (res?.identifier || []).find((i: any) => (i.system || "").includes(kind))?.value;

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

export default function DraftReferralViewPage() {
  const { user, ready } = useAuth();
  const { baseUrl } = useSettings();
  const router = useRouter();
  const params = useParams();
  const serviceRequestId = String(params.serviceRequestId);

  const canAccess = user?.role === "admin" || user?.role === "practitioner";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cu, setCu] = useState({
    chiefComplaint: "", clinicalHistory: "",
    dxCode: "", dxDisplay: "", dxText: "",
    treatment: "", labTitle: "", labConclusion: "",
  });

  useEffect(() => {
    if (ready && user && !canAccess) router.replace("/");
  }, [ready, user, canAccess, router]);

  useEffect(() => {
    if (ready && canAccess) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, baseUrl, serviceRequestId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/draft-referrals?serviceRequest=${encodeURIComponent(serviceRequestId)}`, {
        headers: { "X-FHIR-Base-Url": baseUrl },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load draft referral");
      setDetail(data);
      prefill(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function prefill(d: Detail) {
    const chief = (d.conditions || []).find((c: any) => c.category?.[0]?.coding?.[0]?.code === "problem-list-item");
    const dx = (d.conditions || []).find((c: any) => c.category?.[0]?.coding?.[0]?.code === "encounter-diagnosis");
    const proc = (d.procedures || [])[0];
    const dr = (d.diagnosticReports || [])[0];
    setCu({
      chiefComplaint: chief?.code?.text || "",
      clinicalHistory: chief?.note?.[0]?.text || "",
      dxCode: dx?.code?.coding?.[0]?.code || "",
      dxDisplay: dx?.code?.coding?.[0]?.display || "",
      dxText: dx?.code?.text || "",
      treatment: proc?.note?.[0]?.text || "",
      labTitle: dr?.presentedForm?.[0]?.title || dr?.code?.text || "",
      labConclusion: dr?.conclusion || "",
    });
  }

  if (!ready || !user || !canAccess) {
    return <div className="loading">Checking access…</div>;
  }

  const sr = detail?.serviceRequest;
  const patient = detail?.patient;
  const enc = detail?.encounter;
  const age = patient?.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const hasClinicalData = (detail?.conditions?.length || 0) > 0 || (detail?.procedures?.length || 0) > 0;

  return (
    <>
      <AppPageHeader
        items={[
          { label: "Home", href: "/" },
          { label: "Draft Referrals", href: "/ereferral/draft" },
          { label: sr ? `Draft ${sr.id}` : serviceRequestId },
        ]}
        title={`Draft Referral — ${patient ? humanName(patient.name) : serviceRequestId}`}
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {sr && (
              <span className="badge" style={{ background: "var(--brand)", color: "#fff" }}>
                {sr.status || "—"}
              </span>
            )}
            {sr && (
              <button
                className="action-primary"
                onClick={() => router.push(`/ereferral/submit?draft=${encodeURIComponent(sr.id)}`)}
              >
                Submit Referral
              </button>
            )}
          </div>
        }
      />

      {error && <div className="alert err">❌ {error}</div>}
      {loading && !detail && <p className="muted">Loading…</p>}

      {detail && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
          <div>
            <div className="card">
              <h2>Service Request</h2>
              {sr ? (
                <dl className="kv">
                  <dt>ID</dt><dd><code>{sr.id}</code></dd>
                  <dt>Status</dt><dd><span className={`badge ${sr.status || ""}`}>{sr.status || "—"}</span></dd>
                  <dt>Intent</dt><dd>{sr.intent || "—"}</dd>
                  <dt>Category</dt><dd>{sr.category?.[0]?.coding?.[0]?.display || sr.category?.[0]?.text || "—"}</dd>
                  <dt>Authored On</dt><dd>{sr.authoredOn ? new Date(sr.authoredOn).toLocaleString() : "—"}</dd>
                  <dt>Requester</dt><dd><code>{sr.requester?.reference || "—"}</code></dd>
                  {sr.performer?.[0]?.reference && <><dt>Performer</dt><dd><code>{sr.performer[0].reference}</code></dd></>}
                  {sr.reasonCode?.[0]?.text && <><dt>Reason</dt><dd>{sr.reasonCode[0].text}</dd></>}
                  {sr.note?.[0]?.text && <><dt>Note</dt><dd>{sr.note[0].text}</dd></>}
                </dl>
              ) : <p className="muted">No service request found.</p>}
            </div>

            {hasClinicalData && (
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
            )}

            {(cu.labTitle || cu.labConclusion) && (
              <div className="card">
                <h2>Laboratory</h2>
                <dl className="kv">
                  {cu.labTitle && <><dt>Report Title</dt><dd>{cu.labTitle}</dd></>}
                  {cu.labConclusion && <><dt>Conclusion</dt><dd>{cu.labConclusion}</dd></>}
                </dl>
              </div>
            )}
          </div>

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
              <div className="section-header">
                <div className="section-title-wrap">
                  <span className="section-indicator" />
                  <h3 className="section-title" style={{ fontSize: 15 }}>Vitals</h3>
                  <span className="section-count">{(detail?.observations || []).length}</span>
                </div>
              </div>
              <p className="muted" style={{ marginTop: -6 }}>Carried over from triage.</p>
              {(detail?.observations || []).length === 0 ? (
                <p className="muted">No vitals recorded.</p>
              ) : (
                <table className="admin-table">
                  <tbody>
                    {(detail?.observations || []).map((o: any) => (
                      <tr key={o.id}>
                        <td>{LOINC_NAME[obsCode(o)] || o.code?.coding?.[0]?.display || "Observation"}</td>
                        <td><strong>{obsValue(o)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>``

            {enc && (
              <div className="card">
                <div className="section-header">
                  <div className="section-title-wrap">
                    <span className="section-indicator" />
                    <h3 className="section-title" style={{ fontSize: 15 }}>Encounter</h3>
                  </div>
                </div>
                <dl className="kv">
                  <dt>ID</dt><dd><code>{enc.id}</code></dd>
                  <dt>Status</dt><dd><span className={`badge ${enc.status || ""}`}>{enc.status || "—"}</span></dd>
                  <dt>Type</dt><dd>{enc.type?.[0]?.coding?.[0]?.display || enc.class?.display || "—"}</dd>
                  <dt>Origin</dt><dd>{enc.hospitalization?.origin?.display || enc.hospitalization?.origin?.reference || "—"}</dd>
                  <dt>Started</dt><dd>{enc.period?.start ? new Date(enc.period.start).toLocaleString() : "—"}</dd>
                  {enc.period?.end && <><dt>Ended</dt><dd>{new Date(enc.period.end).toLocaleString()}</dd></>}
                  {enc.reasonCode?.[0]?.text && <><dt>Reason</dt><dd>{enc.reasonCode[0].text}</dd></>}
                  {enc.serviceProvider?.reference && <><dt>Service Provider</dt><dd><code>{enc.serviceProvider.reference}</code></dd></>}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
