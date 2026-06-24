"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { fhirGet, FhirError } from "@/lib/fhir";
import { humanName } from "@/lib/referral";

export default function ReferralDetailPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const params = useParams();
  const serviceRequestId = params.id as string;

  const [sr, setSr] = useState<any>(null);
  const [task, setTask] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [encounter, setEncounter] = useState<any>(null);
  const [conditions, setConditions] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [diagnosticReports, setDiagnosticReports] = useState<any[]>([]);
  const [receivingRole, setReceivingRole] = useState<any>(null);
  const [receivingOrg, setReceivingOrg] = useState<any>(null);
  const [receivingPractitioner, setReceivingPractitioner] = useState<any>(null);
  const [requesterRole, setRequesterRole] = useState<any>(null);
  const [requesterOrg, setRequesterOrg] = useState<any>(null);
  const [requesterPractitioner, setRequesterPractitioner] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (ready && user && serviceRequestId) load();
  }, [ready, user, serviceRequestId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Fetch ServiceRequest directly
      const srResource = await fhirGet(`ServiceRequest/${serviceRequestId}`);
      if (!srResource) throw new Error("ServiceRequest not found");
      setSr(srResource);

      // Step 2: Fetch patient
      if (srResource.subject?.reference) {
        const patientResource = await fhirGet(srResource.subject.reference);
        setPatient(patientResource);
      }

      // Step 3: Fetch encounter with _revinclude for Observations using search
      if (srResource.encounter?.reference) {
        const encounterId = srResource.encounter.reference.split('/').pop();
        const encounterBundle = await fhirGet(`Encounter?_id=${encounterId}&_revinclude=Observation:encounter`);
        const encounterResource = encounterBundle.entry?.find((e: any) => e.resource?.resourceType === "Encounter")?.resource;
        setEncounter(encounterResource);
        
        // Extract Observations from the bundle
        const obsResources = (encounterBundle.entry || [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === "Observation");
        setObservations(obsResources);
      }

      // Step 4: Fetch receiving facility (performer - PractitionerRole)
      if (srResource.performer?.[0]?.reference) {
        const performerRole = await fhirGet(srResource.performer[0].reference);
        setReceivingRole(performerRole);
        
        // Fetch receiving organization
        if (performerRole.organization?.reference) {
          const orgResource = await fhirGet(performerRole.organization.reference);
          setReceivingOrg(orgResource);
        }
        
        // Fetch receiving practitioner
        if (performerRole.practitioner?.reference) {
          const practResource = await fhirGet(performerRole.practitioner.reference);
          setReceivingPractitioner(practResource);
        }
      }

      // Step 5: Fetch initiating facility (requester - PractitionerRole)
      if (srResource.requester?.reference) {
        const reqRole = await fhirGet(srResource.requester.reference);
        setRequesterRole(reqRole);
        
        if (reqRole.organization?.reference) {
          const orgResource = await fhirGet(reqRole.organization.reference);
          setRequesterOrg(orgResource);
        }
        
        if (reqRole.practitioner?.reference) {
          const practResource = await fhirGet(reqRole.practitioner.reference);
          setRequesterPractitioner(practResource);
        }
      }

      // Step 6: Fetch Task that references this ServiceRequest
      const taskBundle = await fhirGet(`Task?focus=ServiceRequest/${serviceRequestId}`);
      const taskResource = taskBundle.entry?.find((e: any) => e.resource?.resourceType === "Task")?.resource;
      setTask(taskResource || null);

      // Step 7: Fetch Conditions by patient
      if (patient) {
        const conditionBundle = await fhirGet(`Condition?subject=Patient/${patient.id}`);
        setConditions(
          (conditionBundle.entry || [])
            .map((e: any) => e.resource)
            .filter((r: any) => r?.resourceType === "Condition")
        );
      }

      // Step 8: Fetch Procedures by patient
      if (patient) {
        const procBundle = await fhirGet(`Procedure?subject=Patient/${patient.id}`);
        setProcedures(
          (procBundle.entry || [])
            .map((e: any) => e.resource)
            .filter((r: any) => r?.resourceType === "Procedure")
        );
      }

      // Step 9: Fetch DiagnosticReports by patient
      if (patient) {
        const drBundle = await fhirGet(`DiagnosticReport?subject=Patient/${patient.id}`);
        setDiagnosticReports(
          (drBundle.entry || [])
            .map((e: any) => e.resource)
            .filter((r: any) => r?.resourceType === "DiagnosticReport")
        );
      }

    } catch (e) {
      setError(e instanceof FhirError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <div className="loading">Loading…</div>;
  if (!user) return null;

  if (loading) return <div className="loading">Loading referral…</div>;
  if (error) return <div className="alert err">❌ {error}</div>;
  if (!sr) return <div className="alert err">Referral not found</div>;

  const refId = sr.identifier?.[0]?.value || sr.id;

  return (
    <>
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: "Requested Referrals", href: "/referrals/outgoing" },
        { label: refId }
      ]} />

      <PageHeader
        title={`Referral: ${refId}`}
        actions={
          <>
            <button className="secondary" onClick={load} disabled={loading}>
              Refresh
            </button>
            <Link href="/referrals/outgoing" className="secondary">
              Back to List
            </Link>
          </>
        }
      />

      {task && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Referral Status</h3>
          <div className="grid two">
            <div>
              <label>Status</label>
              <span className={`badge ${task.status}`}>{task.status}</span>
            </div>
            <div>
              <label>Priority</label>
              <span>{task.priority || "—"}</span>
            </div>
            <div>
              <label>Date Created</label>
              <span>{task.authoredOn ? new Date(task.authoredOn).toLocaleString() : "—"}</span>
            </div>
            <div>
              <label>Last Modified</label>
              <span>{task.lastModified ? new Date(task.lastModified).toLocaleString() : "—"}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Patient Information</h3>
        {patient ? (
          <div className="grid two">
            <div>
              <label>Name</label>
              <span>{humanName(patient.name)}</span>
            </div>
            <div>
              <label>Gender</label>
              <span>{patient.gender || "—"}</span>
            </div>
            <div>
              <label>Birth Date</label>
              <span>{patient.birthDate || "—"}</span>
            </div>
            <div>
              <label>Phone</label>
              <span>{patient.telecom?.[0]?.value || "—"}</span>
            </div>
            <div>
              <label>Address</label>
              <span>
                {patient.address?.[0] ? [
                  patient.address[0].line?.[0],
                  patient.address[0].city,
                  patient.address[0].postalCode,
                ].filter(Boolean).join(", ") : "—"}
              </span>
            </div>
            <div>
              <label>PhilHealth ID</label>
              <span>{patient.identifier?.find((i: any) => i.system?.includes("philhealth"))?.value || "—"}</span>
            </div>
          </div>
        ) : (
          <p className="muted">No patient information available</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Receiving Facility</h3>
        {receivingOrg ? (
          <div className="grid two">
            <div>
              <label>Organization</label>
              <span>{receivingOrg.name || "—"}</span>
            </div>
            <div>
              <label>NHFR Code</label>
              <span>{receivingOrg.identifier?.find((i: any) => i.system?.includes("nhfr-code"))?.value || "—"}</span>
            </div>
            {receivingPractitioner && (
              <>
                <div>
                  <label>Practitioner</label>
                  <span>{humanName(receivingPractitioner.name)}</span>
                </div>
                <div>
                  <label>Role</label>
                  <span>{receivingRole?.code?.[0]?.coding?.[0]?.display || receivingRole?.code?.[0]?.text || "—"}</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="muted">No receiving facility information available</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Initiating Facility</h3>
        {requesterOrg ? (
          <div className="grid two">
            <div>
              <label>Organization</label>
              <span>{requesterOrg.name || "—"}</span>
            </div>
            <div>
              <label>NHFR Code</label>
              <span>{requesterOrg.identifier?.find((i: any) => i.system?.includes("nhfr-code"))?.value || "—"}</span>
            </div>
            {requesterPractitioner && (
              <>
                <div>
                  <label>Practitioner</label>
                  <span>{humanName(requesterPractitioner.name)}</span>
                </div>
                <div>
                  <label>Role</label>
                  <span>{requesterRole?.code?.[0]?.coding?.[0]?.display || requesterRole?.code?.[0]?.text || "—"}</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="muted">No initiating facility information available</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Service Request Details</h3>
        <div className="grid two">
          <div>
            <label>Reason for Referral</label>
            <span>{sr.category?.[0]?.coding?.[0]?.display || sr.category?.[0]?.text || "—"}</span>
          </div>
          <div>
            <label>Intent</label>
            <span>{sr.intent || "—"}</span>
          </div>
          <div>
            <label>Authored On</label>
            <span>{sr.authoredOn ? new Date(sr.authoredOn).toLocaleString() : "—"}</span>
          </div>
          <div>
            <label>Occurrence</label>
            <span>{sr.occurrenceDateTime ? new Date(sr.occurrenceDateTime).toLocaleString() : sr.occurrencePeriod?.start ? new Date(sr.occurrencePeriod.start).toLocaleString() : "—"}</span>
          </div>
          {sr.note?.[0]?.text && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Notes</label>
              <span>{sr.note[0].text}</span>
            </div>
          )}
        </div>
      </div>

      {encounter && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Encounter</h3>
          <div className="grid two">
            <div>
              <label>Status</label>
              <span>{encounter.status || "—"}</span>
            </div>
            <div>
              <label>Class</label>
              <span>{encounter.class?.display || encounter.class?.code || "—"}</span>
            </div>
            <div>
              <label>Period</label>
              <span>
                {encounter.period?.start && encounter.period?.end
                  ? `${new Date(encounter.period.start).toLocaleString()} - ${new Date(encounter.period.end).toLocaleString()}`
                  : encounter.period?.start
                  ? new Date(encounter.period.start).toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {conditions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Conditions / Diagnoses ({conditions.length})</h3>
          {conditions.map((c, idx) => (
            <div key={c.id || idx} style={{ marginBottom: idx < conditions.length - 1 ? 12 : 0, paddingBottom: idx < conditions.length - 1 ? 12 : 0, borderBottom: idx < conditions.length - 1 ? "1px solid #e0e0e0" : "none" }}>
              <div className="grid two">
                <div>
                  <label>Code</label>
                  <span>{c.code?.coding?.[0]?.display || c.code?.text || "—"}</span>
                </div>
                <div>
                  <label>Clinical Status</label>
                  <span>{c.clinicalStatus?.coding?.[0]?.display || "—"}</span>
                </div>
                {c.note?.[0]?.text && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Notes</label>
                    <span>{c.note[0].text}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {observations.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Observations ({observations.length})</h3>
          {observations.map((o, idx) => (
            <div key={o.id || idx} style={{ marginBottom: idx < observations.length - 1 ? 12 : 0, paddingBottom: idx < observations.length - 1 ? 12 : 0, borderBottom: idx < observations.length - 1 ? "1px solid #e0e0e0" : "none" }}>
              <div className="grid two">
                <div>
                  <label>Code</label>
                  <span>{o.code?.coding?.[0]?.display || o.code?.text || "—"}</span>
                </div>
                <div>
                  <label>Value</label>
                  <span>
                    {o.valueQuantity 
                      ? `${o.valueQuantity.value} ${o.valueQuantity.unit}`
                      : o.valueCodeableConcept?.text || o.valueString || "—"}
                  </span>
                </div>
                <div>
                  <label>Status</label>
                  <span>{o.status || "—"}</span>
                </div>
                <div>
                  <label>Effective</label>
                  <span>{o.effectiveDateTime ? new Date(o.effectiveDateTime).toLocaleString() : "—"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {procedures.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Procedures ({procedures.length})</h3>
          {procedures.map((p, idx) => (
            <div key={p.id || idx} style={{ marginBottom: idx < procedures.length - 1 ? 12 : 0, paddingBottom: idx < procedures.length - 1 ? 12 : 0, borderBottom: idx < procedures.length - 1 ? "1px solid #e0e0e0" : "none" }}>
              <div className="grid two">
                <div>
                  <label>Code</label>
                  <span>{p.code?.coding?.[0]?.display || p.code?.text || "—"}</span>
                </div>
                <div>
                  <label>Status</label>
                  <span>{p.status || "—"}</span>
                </div>
                {p.note?.[0]?.text && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Notes</label>
                    <span>{p.note[0].text}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {diagnosticReports.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Diagnostic Reports ({diagnosticReports.length})</h3>
          {diagnosticReports.map((dr, idx) => (
            <div key={dr.id || idx} style={{ marginBottom: idx < diagnosticReports.length - 1 ? 12 : 0, paddingBottom: idx < diagnosticReports.length - 1 ? 12 : 0, borderBottom: idx < diagnosticReports.length - 1 ? "1px solid #e0e0e0" : "none" }}>
              <div className="grid two">
                <div>
                  <label>Code</label>
                  <span>{dr.code?.coding?.[0]?.display || dr.code?.text || "—"}</span>
                </div>
                <div>
                  <label>Status</label>
                  <span>{dr.status || "—"}</span>
                </div>
                {dr.conclusion && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Conclusion</label>
                    <span>{dr.conclusion}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
