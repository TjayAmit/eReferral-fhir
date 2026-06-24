"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fhirGet, submitTransaction, FhirError } from "@/lib/fhir";
import {
  type ClinicalInput,
  DEFAULT_INPUT,
  buildReferralBundle,
} from "@/lib/buildBundle";

// ── initial form state helpers ───────────────────────────────────────────────

// Referral ID format: REF-<year>-<6-digit sequence>, e.g. REF-2026-000001.
const formatReferralId = (year: number, seq: number) => `REF-${year}-${String(seq).padStart(6, "0")}`;

// Next sequence = (highest existing REF-<year>-NNNNNN on the server) + 1.
async function fetchNextReferralId(): Promise<string> {
  const year = new Date().getFullYear();
  const re = new RegExp(`^REF-${year}-(\\d{6})$`);
  try {
    const b = await fhirGet(`ServiceRequest?_count=500&_sort=-_lastUpdated&_elements=requisition`);
    let max = 0;
    for (const e of b.entry || []) {
      const v: string | undefined = e.resource?.requisition?.value;
      const m = v?.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return formatReferralId(year, max + 1);
  } catch {
    return formatReferralId(year, 1);
  }
}

const nowLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

const makeInitialInput = (): ClinicalInput => ({
  ...structuredClone(DEFAULT_INPUT),
  referralId: formatReferralId(new Date().getFullYear(), 1),
  authoredOn: nowLocal(),
});

// ── helpers ─────────────────────────────────────────────────────────────────

function practName(p: any): string {
  const n = p?.name?.[0];
  if (!n) return p?.id || "—";
  return [...(n.prefix || []), ...(n.given || []), n.family].filter(Boolean).join(" ");
}

function idVal(identifiers: any[], fragment: string): string | undefined {
  return identifiers?.find((i: any) => (i.system || "").includes(fragment))?.value;
}

// ── page ────────────────────────────────────────────────────────────────────

type Result = { ok: boolean; bundle?: any; error?: string };

export default function SubmitPage() {
  const { user } = useAuth();

  const [orgs, setOrgs] = useState<any[]>([]);
  const [practitioners, setPractitioners] = useState<any[]>([]);
  const [practitionerRoles, setPractitionerRoles] = useState<any[]>([]);
  const [selectedReceivingRole, setSelectedReceivingRole] = useState<any>(null);
  const [selectedReceivingPractitioner, setSelectedReceivingPractitioner] = useState<any>(null);
  const [input, setInput] = useState<ClinicalInput>(makeInitialInput);
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fhirGet("Organization?_sort=name&_count=100").then((b) =>
      setOrgs((b.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Organization"))
    ).catch(() => {});

    fhirGet("Practitioner?_sort=family%2Cgiven&_count=100").then((b) =>
      setPractitioners((b.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "Practitioner"))
    ).catch(() => {});

    // Assign the next running referral ID (REF-<year>-NNNNNN) from the server.
    fetchNextReferralId().then((id) => set("referralId", id)).catch(() => {});
  }, []);

  // Fetch PractitionerRoles for the selected receiving organization
  useEffect(() => {
    if (!input.selectedReceivingOrgId) {
      setPractitionerRoles([]);
      return;
    }
    fhirGet(`PractitionerRole?organization=Organization/${input.selectedReceivingOrgId}`)
      .then((b) =>
        setPractitionerRoles((b.entry || []).map((e: any) => e.resource).filter((r: any) => r?.resourceType === "PractitionerRole"))
      )
      .catch(() => setPractitionerRoles([]));
  }, [input.selectedReceivingOrgId]);

  // Reset receiving role/practitioner when receiving org changes
  useEffect(() => {
    set("selectedReceivingRoleId", "");
    set("selectedReceivingPractitionerId", "");
    setSelectedReceivingRole(null);
    setSelectedReceivingPractitioner(null);
  }, [input.selectedReceivingOrgId]);

  // Fetch the selected PractitionerRole resource and auto-populate practitioner.
  // The practitioner is fetched directly from the role's reference (not the bounded
  // pre-loaded list) so a practitioner outside the first 100 still resolves.
  useEffect(() => {
    if (!input.selectedReceivingRoleId) {
      setSelectedReceivingRole(null);
      setSelectedReceivingPractitioner(null);
      set("selectedReceivingPractitionerId", "");
      return;
    }
    fhirGet(`PractitionerRole/${input.selectedReceivingRoleId}`)
      .then((r) => {
        setSelectedReceivingRole(r);
        const practRef = r?.practitioner?.reference;
        const practId = practRef?.split("/").pop() || "";
        set("selectedReceivingPractitionerId", practId);
        if (practRef) {
          fhirGet(practRef)
            .then((p) => setSelectedReceivingPractitioner(p?.resourceType === "Practitioner" ? p : null))
            .catch(() => setSelectedReceivingPractitioner(null));
        } else {
          setSelectedReceivingPractitioner(null);
        }
      })
      .catch(() => {
        setSelectedReceivingRole(null);
        setSelectedReceivingPractitioner(null);
      });
  }, [input.selectedReceivingRoleId]);

  const set = (path: string, value: any) =>
    setInput((prev) => {
      const next: any = structuredClone(prev);
      const keys = path.split(".");
      let cur = next;
      for (let k = 0; k < keys.length - 1; k++) cur = cur[keys[k]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });

  // Receiving organization resource (from the loaded list)
  const receivingOrg = useMemo(
    () => orgs.find((o) => o.id === input.selectedReceivingOrgId) || null,
    [orgs, input.selectedReceivingOrgId]
  );

  // Selected receiving practitioner — wired into the receiving PractitionerRole (Task.owner).
  // Prefer the resource fetched directly from the role reference; fall back to the list.
  const receivingPractitioner = useMemo(
    () =>
      selectedReceivingPractitioner ||
      practitioners.find((p) => p.id === input.selectedReceivingPractitionerId) ||
      null,
    [selectedReceivingPractitioner, practitioners, input.selectedReceivingPractitionerId]
  );

  // Requester resources come straight from the logged-in user's session
  const hasRequester = !!(user?.practitioner && user?.organization && user?.practitionerRole);
  const missingConfig = !hasRequester;

  const bundle = useMemo(
    () =>
      hasRequester && receivingOrg
        ? buildReferralBundle(
            input,
            { practitioner: user!.practitioner, organization: user!.organization, practitionerRole: user!.practitionerRole },
            { organization: receivingOrg, practitionerRole: selectedReceivingRole || undefined, practitioner: receivingPractitioner || undefined }
          )
        : null,
    [input, hasRequester, user, receivingOrg, selectedReceivingRole, receivingPractitioner]
  );

  async function onSubmit() {
    if (!bundle) return;
    setBusy(true);
    setResult(null);
    try {
      const resp = await submitTransaction(bundle);
      setResult({ ok: true, bundle: resp });
    } catch (e) {
      setResult({ ok: false, error: e instanceof FhirError ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  // PractitionerRoles — filtered by selected receiving organization
  const receivingRoleOptions = practitionerRoles;

  // Practitioner linked to the selected receiving PractitionerRole
  const receivingPractitionerOption = selectedReceivingRole ? receivingPractitioner : null;

  return (
    <>
      <h1>Submit eReferral Bundle</h1>
      <p className="sub">
        One <code>transaction</code> Bundle, structured to match the IG example. Your practitioner, role and
        organization come from your account; fill in the patient/clinical data and select the receiving facility.
      </p>

      {missingConfig && (
        <div className="alert err">
          Your account is missing a linked practitioner, role or organization. Contact an admin.
        </div>
      )}

      {/* ── Requester (auto from logged-in user) ─────────────────── */}
      <div className="card">
        <h2>Requester (from your account)</h2>
        <div className="grid two">
          <dl className="kv">
            <dt>Referring practitioner</dt>
            <dd>{practName(user?.practitioner)} {idVal(user?.practitioner?.identifier, "prc") ? <span className="muted">· PRC {idVal(user?.practitioner?.identifier, "prc")}</span> : null}</dd>
            <dt>Role</dt>
            <dd>{user?.practitionerRole?.code?.[0]?.coding?.[0]?.display || user?.practitionerRole?.code?.[0]?.text || user?.practitionerRole?.id || "—"}</dd>
          </dl>
          <dl className="kv">
            <dt>Initiating organization</dt>
            <dd>{user?.organization?.name || "—"}</dd>
            <dt>NHFR</dt>
            <dd>{idVal(user?.organization?.identifier, "nhfr") || "—"}</dd>
          </dl>
        </div>
      </div>

      {/* ── Participants (receiving side — select from FHIR) ─────── */}
      <div className="card">
        <h2>Refer To (select from FHIR)</h2>
        <div className="grid two">
          <div className="field">
            <label>Receiving organization <span className="muted">(required)</span></label>
            <select value={input.selectedReceivingOrgId} onChange={(e) => set("selectedReceivingOrgId", e.target.value)}>
              <option value="">— select organization —</option>
              {orgs
                .filter((o) => o.id !== user?.organization?.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    [{o.id}] {o.name}{idVal(o.identifier, "nhfr") ? ` · NHFR ${idVal(o.identifier, "nhfr")}` : ""}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>Practitioner role <span className="muted">(optional)</span></label>
            <select
              value={input.selectedReceivingRoleId}
              onChange={(e) => set("selectedReceivingRoleId", e.target.value)}
              disabled={!input.selectedReceivingOrgId}
            >
              <option value="">
                {input.selectedReceivingOrgId ? "— none —" : "— select receiving org first —"}
              </option>
              {receivingRoleOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code?.[0]?.coding?.[0]?.display || r.code?.[0]?.text || "Role"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Practitioner <span className="muted">(optional)</span></label>
            <select
              value={input.selectedReceivingPractitionerId}
              onChange={(e) => set("selectedReceivingPractitionerId", e.target.value)}
              disabled={!input.selectedReceivingRoleId}
            >
              <option value="">
                {input.selectedReceivingRoleId
                  ? (receivingPractitionerOption ? practName(receivingPractitionerOption) : "— no practitioner —")
                  : "— select role first —"}
              </option>
              {receivingPractitionerOption && (
                <option key={receivingPractitionerOption.id} value={receivingPractitionerOption.id}>
                  {practName(receivingPractitionerOption)}
                </option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* ── Referral metadata ─────────────────────────────────── */}
      <div className="card">
        <h2>Referral</h2>
        <div className="grid three">
          <div className="field">
            <label>Referral ID</label>
            <input value={input.referralId} onChange={(e) => set("referralId", e.target.value)} />
          </div>
          <div className="field">
            <label>Referral category (REF-14)</label>
            <select value={input.referralCategory} onChange={(e) => set("referralCategory", e.target.value)}>
              <option value="emergency">Emergency</option>
              <option value="outpatient">Outpatient</option>
            </select>
          </div>
          <div className="field">
            <label>Date of Referral (REF-13)</label>
            <input type="datetime-local" value={input.authoredOn} onChange={(e) => set("authoredOn", e.target.value)} />
          </div>
        </div>
        <div className="grid two">
          <div className="field">
            <label>Service type code (SNOMED, REF-16)</label>
            <input value={input.serviceType.code} onChange={(e) => set("serviceType.code", e.target.value)} />
          </div>
          <div className="field">
            <label>Service type display</label>
            <input value={input.serviceType.display} onChange={(e) => set("serviceType.display", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Reason text (clinical reason for referral)</label>
          <textarea rows={2} value={input.reasonText} onChange={(e) => set("reasonText", e.target.value)} />
        </div>
        <div className="field">
          <label>Referral note (ServiceRequest.note)</label>
          <textarea rows={2} value={input.referralNote} onChange={(e) => set("referralNote", e.target.value)} />
        </div>
      </div>

      {/* ── Patient ───────────────────────────────────────────── */}
      <div className="card">
        <h2>Patient (REF-21–30)</h2>
        <div className="grid three">
          <div className="field"><label>Given name(s)</label>
            <input value={input.patient.given} onChange={(e) => set("patient.given", e.target.value)} /></div>
          <div className="field"><label>Family name</label>
            <input value={input.patient.family} onChange={(e) => set("patient.family", e.target.value)} /></div>
          <div className="field"><label>Sex</label>
            <select value={input.patient.gender} onChange={(e) => set("patient.gender", e.target.value)}>
              <option>female</option><option>male</option><option>other</option><option>unknown</option>
            </select></div>
          <div className="field"><label>Birth date</label>
            <input type="date" value={input.patient.birthDate} onChange={(e) => set("patient.birthDate", e.target.value)} /></div>
          <div className="field"><label>PhilHealth ID</label>
            <input value={input.patient.philhealth} onChange={(e) => set("patient.philhealth", e.target.value)} /></div>
          <div className="field"><label>PhilSys ID</label>
            <input value={input.patient.philsys} onChange={(e) => set("patient.philsys", e.target.value)} /></div>
          <div className="field"><label>Phone</label>
            <input value={input.patient.phone} onChange={(e) => set("patient.phone", e.target.value)} /></div>
          <div className="field"><label>Address line</label>
            <input value={input.patient.line} onChange={(e) => set("patient.line", e.target.value)} /></div>
          <div className="field"><label>City</label>
            <input value={input.patient.city} onChange={(e) => set("patient.city", e.target.value)} /></div>
          <div className="field"><label>Postal code</label>
            <input value={input.patient.postalCode} onChange={(e) => set("patient.postalCode", e.target.value)} /></div>
          <div className="field"><label>Next of kin — given</label>
            <input value={input.patient.contactGiven} onChange={(e) => set("patient.contactGiven", e.target.value)} /></div>
          <div className="field"><label>Next of kin — family</label>
            <input value={input.patient.contactFamily} onChange={(e) => set("patient.contactFamily", e.target.value)} /></div>
          <div className="field"><label>NOK relationship code</label>
            <input value={input.patient.contactRelCode} onChange={(e) => set("patient.contactRelCode", e.target.value)} /></div>
          <div className="field"><label>NOK relationship display</label>
            <input value={input.patient.contactRelDisplay} onChange={(e) => set("patient.contactRelDisplay", e.target.value)} /></div>
        </div>
      </div>

      {/* ── Vital signs ───────────────────────────────────────── */}
      <div className="card">
        <h2>Vital Signs (REF-33–38)</h2>
        <div className="grid three">
          <div className="field"><label>Systolic BP</label>
            <input type="number" value={input.vitals.systolic} onChange={(e) => set("vitals.systolic", +e.target.value)} /></div>
          <div className="field"><label>Diastolic BP</label>
            <input type="number" value={input.vitals.diastolic} onChange={(e) => set("vitals.diastolic", +e.target.value)} /></div>
          <div className="field"><label>Heart rate</label>
            <input type="number" value={input.vitals.hr} onChange={(e) => set("vitals.hr", +e.target.value)} /></div>
          <div className="field"><label>Respiratory rate</label>
            <input type="number" value={input.vitals.rr} onChange={(e) => set("vitals.rr", +e.target.value)} /></div>
          <div className="field"><label>O₂ saturation (%)</label>
            <input type="number" value={input.vitals.spo2} onChange={(e) => set("vitals.spo2", +e.target.value)} /></div>
          <div className="field"><label>Temperature (°C)</label>
            <input type="number" step="0.1" value={input.vitals.temp} onChange={(e) => set("vitals.temp", +e.target.value)} /></div>
          <div className="field"><label>Weight (kg)</label>
            <input type="number" value={input.vitals.weight} onChange={(e) => set("vitals.weight", +e.target.value)} /></div>
        </div>
      </div>

      {/* ── Clinical ──────────────────────────────────────────── */}
      <div className="card">
        <h2>Clinical (REF-31, 32, 39, 41)</h2>
        <div className="field"><label>Chief complaint (REF-31)</label>
          <textarea rows={2} value={input.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} /></div>
        <div className="field"><label>Clinical history (REF-32)</label>
          <textarea rows={2} value={input.clinicalHistory} onChange={(e) => set("clinicalHistory", e.target.value)} /></div>
        <div className="grid two">
          <div className="field"><label>Impression code (SNOMED, REF-41)</label>
            <input value={input.impression.code} onChange={(e) => set("impression.code", e.target.value)} /></div>
          <div className="field"><label>Impression display</label>
            <input value={input.impression.display} onChange={(e) => set("impression.display", e.target.value)} /></div>
        </div>
        <div className="field"><label>Impression text</label>
          <input value={input.impression.text} onChange={(e) => set("impression.text", e.target.value)} /></div>
        <div className="field"><label>Treatment given (REF-39)</label>
          <textarea rows={2} value={input.treatment} onChange={(e) => set("treatment", e.target.value)} /></div>
      </div>

      {/* ── Diagnostic / lab ──────────────────────────────────── */}
      <div className="card">
        <h2>Laboratory (REF-40)</h2>
        <div className="grid two">
          <div className="field"><label>Report title</label>
            <input value={input.diagnostic.title} onChange={(e) => set("diagnostic.title", e.target.value)} /></div>
          <div className="field"><label>Conclusion</label>
            <input value={input.diagnostic.conclusion} onChange={(e) => set("diagnostic.conclusion", e.target.value)} /></div>
        </div>
      </div>

      {/* ── Workflow / Task ───────────────────────────────────── */}
      <div className="card">
        <h2>Workflow (Task)</h2>
        <div className="field"><label>Task summary (code text)</label>
          <input value={input.taskCodeText} onChange={(e) => set("taskCodeText", e.target.value)} /></div>
        <div className="field"><label>Task note</label>
          <textarea rows={2} value={input.taskNote} onChange={(e) => set("taskNote", e.target.value)} /></div>
      </div>

      {/* ── Actions ───────────────────────────────────────────── */}
      <div className="row">
        <button onClick={onSubmit} disabled={busy || !bundle || missingConfig}>
          {busy ? "Submitting…" : "Submit eReferral Bundle"}
        </button>
        <button className="ghost" onClick={() => setShowJson((v) => !v)}>
          {showJson ? "Hide" : "Preview"} JSON
        </button>
        {bundle && <span className="muted">{bundle.entry.length} entries</span>}
        {!input.selectedReceivingOrgId && <span className="muted" style={{ color: "#c00" }}>Select a receiving organization to enable submit</span>}
      </div>

      {showJson && bundle && <pre>{JSON.stringify(bundle, null, 2)}</pre>}

      {result?.ok && <SubmitResult bundle={result.bundle} />}
      {result && !result.ok && <div className="alert err">❌ {result.error}</div>}
    </>
  );
}

function SubmitResult({ bundle }: { bundle: any }) {
  const entries = bundle?.entry || [];
  const allOk = entries.every((e: any) => /^20[01]/.test(e.response?.status || ""));
  return (
    <>
      <div className={`alert ${allOk ? "ok" : "err"}`}>
        {allOk ? "✅" : "⚠️"} transaction-response · {entries.length} entries{" "}
        {allOk ? "— all succeeded" : "— check statuses below"}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>#</th><th>Status</th><th>Location</th></tr></thead>
          <tbody>
            {entries.map((e: any, idx: number) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{e.response?.status || "—"}</td>
                <td><code>{(e.response?.location || "").split("/_history")[0] || "—"}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
