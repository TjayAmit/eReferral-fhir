// Builds the clinical data a doctor records when checking a triaged patient.
//
// The consult is modelled as one transaction Bundle that creates an Encounter
// (the visit) and links the clinical findings to it and to the Patient:
//   - Observations  : vital signs (LOINC), only for values that were entered
//   - Condition     : chief complaint (problem-list-item) + clinical history note
//   - Condition     : working diagnosis/impression (encounter-diagnosis, SNOMED)
//   - Procedure     : treatment given (optional)
// Codes mirror src/lib/referral.ts so the data lines up with the eReferral flow.

const SNOMED = "http://snomed.info/sct";
const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";

// Bundle-internal references must be valid lowercase UUID urns (server-enforced).
const uuid = () => `urn:uuid:${crypto.randomUUID()}`;

export interface Vitals {
  systolic?: number;
  diastolic?: number;
  hr?: number;
  rr?: number;
  spo2?: number;
  temp?: number;
  weight?: number;
  height?: number;
}

/** Reasons a vitals observation may be absent (FHIR Observation.dataAbsentReason). */
export const VITALS_NOT_FETCHED_REASONS = [
  { code: "not-performed", display: "Not performed (clinical emergency)" },
  { code: "unavailable", display: "Unavailable" },
  { code: "asked-declined", display: "Patient declined" },
  { code: "error", display: "Measurement error" },
] as const;

export const DATA_ABSENT_REASON_SYSTEM = "http://terminology.hl7.org/CodeSystem/data-absent-reason";

/** Encounter type for an emergency triage visit (SNOMED). */
export const EMERGENCY_TRIAGE_TYPE = { code: "225390008", display: "Triage", system: SNOMED };

export interface ClinicalAssessmentInput {
  patientId: string;
  practitionerId: string; // the attending doctor
  organizationId?: string; // Encounter.serviceProvider (org responsible for the visit)
  originOrganizationId?: string; // Encounter.hospitalization.origin (originating facility — e.g. the logged-in user's org)
  effectiveDateTime: string; // ISO timestamp of the assessment
  vitals: Vitals;
  chiefComplaint?: string; // REF-31
  clinicalHistory?: string; // REF-32
  diagnosis?: { code?: string; display?: string; text?: string }; // REF-41 working impression
  treatment?: string; // REF-39
  diagnostic?: { title?: string; conclusion?: string }; // REF-40 laboratory / DiagnosticReport
  // When set, attach the clinical resources to this EXISTING encounter (e.g. the
  // triage encounter) instead of creating a new one.
  existingEncounterId?: string;
  // When editing, PUT these existing resources instead of POSTing duplicates.
  existingChiefConditionId?: string;
  existingDxConditionId?: string;
  existingProcedureId?: string;
  existingDiagnosticReportId?: string;
  // ── Encounter shape (defaults: finished / ambulatory). For triage, pass
  //    status "triaged", class "EMER", and EMERGENCY_TRIAGE_TYPE. ──
  encounterStatus?: string;
  encounterClass?: { code: string; display: string };
  encounterType?: { code: string; display: string; system?: string };
  reasonCode?: { code: string; display?: string; system?: string };
  // ── Vitals not fetched (emergency): emit one value-less vital-signs
  //    Observation carrying a dataAbsentReason instead of measured values. ──
  vitalsNotFetched?: boolean;
  vitalsNotFetchedReason?: { code: string; display: string };
}

function vitalObs(
  patientRef: string,
  encounterRef: string,
  eff: string,
  loinc: string,
  display: string,
  value: number,
  unit: string,
  ucum: string
) {
  return {
    fullUrl: uuid(),
    request: { method: "POST", url: "Observation" },
    resource: {
      resourceType: "Observation",
      status: "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "vital-signs",
              display: "Vital Signs",
            },
          ],
        },
      ],
      code: { coding: [{ system: LOINC, code: loinc, display }] },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      effectiveDateTime: eff,
      valueQuantity: { value, unit, system: UCUM, code: ucum },
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: Observation</b></p><p>${display}: ${value} ${unit}</p></div>`,
      },
    },
  };
}

/** Build the transaction Bundle of clinical resources for a doctor's assessment. */
export function buildClinicalBundle(input: ClinicalAssessmentInput) {
  const patientRef = `Patient/${input.patientId}`;
  const practitionerRef = `Practitioner/${input.practitionerId}`;
  // Reference the existing (triage) encounter when given; otherwise create one.
  const encounterRef = input.existingEncounterId ? `Encounter/${input.existingEncounterId}` : uuid();
  const eff = input.effectiveDateTime;
  const v = input.vitals;

  const entry: any[] = [];

  // The visit itself — skipped when attaching to an existing encounter.
  const encClass = input.encounterClass || { code: "AMB", display: "ambulatory" };
  if (!input.existingEncounterId) entry.push({
    fullUrl: encounterRef,
    request: { method: "POST", url: "Encounter" },
    resource: {
      resourceType: "Encounter",
      status: input.encounterStatus || "finished",
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: encClass.code,
        display: encClass.display,
      },
      ...(input.encounterType
        ? {
            type: [
              {
                coding: [
                  {
                    system: input.encounterType.system || SNOMED,
                    code: input.encounterType.code,
                    display: input.encounterType.display,
                  },
                ],
              },
            ],
          }
        : {}),
      subject: { reference: patientRef },
      participant: [
        {
          type: [
            {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                  code: "ATND",
                  display: "attender",
                },
              ],
            },
          ],
          individual: { reference: practitionerRef },
        },
      ],
      period: { start: eff },
      ...(input.reasonCode
        ? {
            reasonCode: [
              {
                coding: [
                  {
                    system: input.reasonCode.system || SNOMED,
                    code: input.reasonCode.code,
                    display: input.reasonCode.display,
                  },
                ],
              },
            ],
          }
        : {}),
      ...(input.organizationId
        ? { serviceProvider: { reference: `Organization/${input.organizationId}` } }
        : {}),
      // Originating facility (where the patient presented / was triaged) — base FHIR
      // Encounter.hospitalization.origin, allowed by the eReferral Encounter profile.
      ...(input.originOrganizationId
        ? { hospitalization: { origin: { reference: `Organization/${input.originOrganizationId}` } } }
        : {}),
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: Encounter</b></p><p>Status: ${input.encounterStatus || "finished"} · Class: ${encClass.display}</p></div>`,
      },
    },
  });

  // Vitals not fetched (e.g. clinical emergency): record one value-less
  // vital-signs Observation carrying a dataAbsentReason instead of measurements.
  if (input.vitalsNotFetched) {
    const reason = input.vitalsNotFetchedReason || VITALS_NOT_FETCHED_REASONS[0];
    entry.push({
      fullUrl: uuid(),
      request: { method: "POST", url: "Observation" },
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "vital-signs",
                display: "Vital Signs",
              },
            ],
          },
        ],
        code: { coding: [{ system: LOINC, code: "85353-1", display: "Vital signs, weight, height, head circumference, oxygen saturation and BMI panel" }] },
        subject: { reference: patientRef },
        encounter: { reference: encounterRef },
        effectiveDateTime: eff,
        dataAbsentReason: {
          coding: [{ system: DATA_ABSENT_REASON_SYSTEM, code: reason.code, display: reason.display }],
        },
        text: {
          status: "generated",
          div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: Observation</b></p><p>Vital signs not fetched: ${reason.display}</p></div>`,
        },
      },
    });
  }

  // Blood pressure panel (only if at least one component is present).
  if (!input.vitalsNotFetched && (v.systolic != null || v.diastolic != null)) {
    const component: any[] = [];
    if (v.systolic != null)
      component.push({
        code: { coding: [{ system: LOINC, code: "8480-6", display: "Systolic blood pressure" }] },
        valueQuantity: { value: v.systolic, unit: "mmHg", system: UCUM, code: "mm[Hg]" },
      });
    if (v.diastolic != null)
      component.push({
        code: { coding: [{ system: LOINC, code: "8462-4", display: "Diastolic blood pressure" }] },
        valueQuantity: { value: v.diastolic, unit: "mmHg", system: UCUM, code: "mm[Hg]" },
      });
    entry.push({
      fullUrl: uuid(),
      request: { method: "POST", url: "Observation" },
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "vital-signs",
                display: "Vital Signs",
              },
            ],
          },
        ],
        code: {
          coding: [{ system: LOINC, code: "85354-9", display: "Blood pressure panel with all children optional" }],
        },
        subject: { reference: patientRef },
        encounter: { reference: encounterRef },
        effectiveDateTime: eff,
        component,
        text: {
          status: "generated",
          div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: Observation</b></p><p>Blood pressure panel</p></div>`,
        },
      },
    });
  }

  if (!input.vitalsNotFetched) {
    if (v.hr != null) entry.push(vitalObs(patientRef, encounterRef, eff, "8867-4", "Heart rate", v.hr, "beats/minute", "/min"));
    if (v.rr != null) entry.push(vitalObs(patientRef, encounterRef, eff, "9279-1", "Respiratory rate", v.rr, "breaths/minute", "/min"));
    if (v.spo2 != null) entry.push(vitalObs(patientRef, encounterRef, eff, "2708-6", "Oxygen saturation in Arterial blood", v.spo2, "%", "%"));
    if (v.temp != null) entry.push(vitalObs(patientRef, encounterRef, eff, "8310-5", "Body temperature", v.temp, "Cel", "Cel"));
    if (v.weight != null) entry.push(vitalObs(patientRef, encounterRef, eff, "29463-7", "Body weight", v.weight, "kg", "kg"));
    if (v.height != null) entry.push(vitalObs(patientRef, encounterRef, eff, "8302-2", "Body height", v.height, "cm", "cm"));
  }

  // Chief complaint + clinical history.
  if (input.chiefComplaint || input.clinicalHistory) {
    const chiefRes: any = {
      resourceType: "Condition",
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-category",
              code: "problem-list-item",
              display: "Problem List Item",
            },
          ],
        },
      ],
      code: { text: input.chiefComplaint || "Chief complaint" },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      recordedDate: eff,
      ...(input.clinicalHistory ? { note: [{ text: input.clinicalHistory }] } : {}),
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: Condition</b></p><p>Chief complaint: ${input.chiefComplaint || "—"}</p></div>`,
      },
    };
    if (input.existingChiefConditionId) {
      chiefRes.id = input.existingChiefConditionId;
      entry.push({
        fullUrl: uuid(),
        request: { method: "PUT", url: `Condition/${input.existingChiefConditionId}` },
        resource: chiefRes,
      });
    } else {
      entry.push({ fullUrl: uuid(), request: { method: "POST", url: "Condition" }, resource: chiefRes });
    }
  }

  // Working diagnosis / impression.
  const dx = input.diagnosis;
  if (dx && (dx.code || dx.text || dx.display)) {
    const dxRes: any = {
      resourceType: "Condition",
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "provisional" }] },
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-category",
              code: "encounter-diagnosis",
              display: "Encounter Diagnosis",
            },
          ],
        },
      ],
      code: {
        ...(dx.code ? { coding: [{ system: SNOMED, code: dx.code, display: dx.display }] } : {}),
        ...(dx.text || dx.display ? { text: dx.text || dx.display } : {}),
      },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      recordedDate: eff,
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: Condition</b></p><p>Working diagnosis: ${dx.text || dx.display || "—"}</p></div>`,
      },
    };
    if (input.existingDxConditionId) {
      dxRes.id = input.existingDxConditionId;
      entry.push({
        fullUrl: uuid(),
        request: { method: "PUT", url: `Condition/${input.existingDxConditionId}` },
        resource: dxRes,
      });
    } else {
      entry.push({ fullUrl: uuid(), request: { method: "POST", url: "Condition" }, resource: dxRes });
    }
  }

  // Treatment given.
  if (input.treatment) {
    const procRes: any = {
      resourceType: "Procedure",
      status: "completed",
      code: { coding: [{ system: SNOMED, code: "416608005", display: "Drug therapy" }], text: input.treatment },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      performedDateTime: eff,
      note: [{ text: input.treatment }],
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: Procedure</b></p><p>Treatment: ${input.treatment}</p></div>`,
      },
    };
    if (input.existingProcedureId) {
      procRes.id = input.existingProcedureId;
      entry.push({
        fullUrl: uuid(),
        request: { method: "PUT", url: `Procedure/${input.existingProcedureId}` },
        resource: procRes,
      });
    } else {
      entry.push({ fullUrl: uuid(), request: { method: "POST", url: "Procedure" }, resource: procRes });
    }
  }

  // Laboratory result (REF-40) — DiagnosticReport. No attachment contentType: the
  // server's MimeType binding can't resolve urn:ietf:bcp:13, so data/title alone.
  const lab = input.diagnostic;
  if (lab && (lab.title || lab.conclusion)) {
    const drRes: any = {
      resourceType: "DiagnosticReport",
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory" }] }],
      code: { coding: [{ system: LOINC, code: "11502-2", display: "Laboratory report" }], text: lab.title || "Laboratory report" },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      effectiveDateTime: eff,
      ...(lab.conclusion ? { conclusion: lab.conclusion } : {}),
      ...(lab.title ? { presentedForm: [{ title: lab.title }] } : {}),
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative: DiagnosticReport</b></p><p>${lab.title || "Laboratory report"}: ${lab.conclusion || "—"}</p></div>`,
      },
    };
    if (input.existingDiagnosticReportId) {
      drRes.id = input.existingDiagnosticReportId;
      entry.push({
        fullUrl: uuid(),
        request: { method: "PUT", url: `DiagnosticReport/${input.existingDiagnosticReportId}` },
        resource: drRes,
      });
    } else {
      entry.push({ fullUrl: uuid(), request: { method: "POST", url: "DiagnosticReport" }, resource: drRes });
    }
  }

  return { resourceType: "Bundle", type: "transaction", entry };
}

/** Sample assessment (used by tests / docs). */
export const SAMPLE_ASSESSMENT: ClinicalAssessmentInput = {
  patientId: "16802",
  practitionerId: "16805",
  organizationId: "16723",
  effectiveDateTime: "2026-06-24T10:30:00+08:00",
  vitals: { systolic: 150, diastolic: 95, hr: 88, rr: 18, spo2: 98, temp: 37.1, weight: 68 },
  chiefComplaint: "Severe headache and elevated blood pressure",
  clinicalHistory: "Known hypertensive, 2 days of occipital headache, no focal deficits.",
  diagnosis: { code: "38341003", display: "Hypertensive disorder", text: "Hypertensive urgency" },
  treatment: "Oral antihypertensive given; advised monitoring and referral to internal medicine.",
};
