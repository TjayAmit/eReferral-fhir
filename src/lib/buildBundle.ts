// eReferral submission Bundle builder.
//
// Goal: produce a transaction Bundle whose STRUCTURE is identical to the IG
// example `ana-reyes-bundle.json` — same 20 entries, same order, same
// meta.profile / language / generated narrative on every resource, same
// reference wiring, same request methods/urls and codings.
//
// Master data (Practitioner, Organizations, PractitionerRoles) already EXISTS on
// the server — both the requester side (from the logged-in session) and the
// receiving side (from the form selection). The bundle references those resources
// by their literal id and does NOT re-submit them. Only the new clinical resources
// (Patient upsert + ServiceRequest, Encounter, Conditions, Observations, Procedure,
// DiagnosticReport, Task, Provenance) are created — POSTed so the server assigns
// the ids. Per project rule:
//   • ServiceRequest.performer  → receiving ORGANIZATION only.
//   • Task.owner                → receiving PractitionerRole (existing, references
//     its Practitioner); falls back to the Organization when none is selected.

import { SYS } from "@/lib/referral";

// ---- Canonical profiles (match the IG example) ----------------------------
const PROFILE = {
  patient: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-patient",
  practitioner: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-practitioner",
  organization: "https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-organization",
  practitionerRole: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-practitioner-role",
  serviceRequest: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-service-request",
  encounter: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-encounter",
  condition: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-condition",
  observation: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-observation",
  procedure: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-procedure",
  task: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-task",
  provenance: "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-provenance",
};

// ---- Terminology systems --------------------------------------------------
const CS = {
  snomed: "http://snomed.info/sct",
  loinc: "http://loinc.org",
  ucum: "http://unitsofmeasure.org",
  roleCode: "http://terminology.hl7.org/CodeSystem/v3-RoleCode",
  actCode: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  conditionClinical: "http://terminology.hl7.org/CodeSystem/condition-clinical",
  conditionVer: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
  conditionCategory: "http://terminology.hl7.org/CodeSystem/condition-category",
  obsCategory: "http://terminology.hl7.org/CodeSystem/observation-category",
  dataOperation: "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
  provAgentType: "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
  signatureType: "urn:iso-astm:E1762-95:2013",
};

// Referral Category VS (relational-diagram §4.2)
const REFERRAL_CATEGORY: Record<string, { code: string; display: string; text: string }> = {
  emergency: { code: "73770003", display: "Hospital-based outpatient emergency care center", text: "Emergency" },
  outpatient: { code: "440655000", display: "Outpatient", text: "Outpatient" },
};

// Placeholder professional signature (valid base64), as in the IG example.
const SIGNATURE_DATA = "dGVzdHNpZ25hdHVyZWJhc2U2NA==";

// ---------------------------------------------------------------------------
// Input type (form-driven clinical data only — requester is from session)
// ---------------------------------------------------------------------------
export type ClinicalInput = {
  referralId: string;
  patientId?: string;             // when set, reference existing Patient/<id> (no re-create)
  authoredOn: string;             // datetime-local (YYYY-MM-DDTHH:MM)
  referralCategory: string;       // emergency | outpatient  -> SR.category (REF-14)
  serviceType: { code: string; display: string }; // SR.reasonCode coding (REF-16)
  reasonText: string;             // SR.reasonCode.text (clinical reason)
  referralNote: string;           // SR.note
  encounterClass: string;
  encounterClassDisplay: string;
  selectedReceivingOrgId: string;
  selectedReceivingRoleId: string;
  selectedReceivingPractitionerId: string;
  patient: {
    philhealth: string; philsys: string;
    family: string; given: string;
    gender: string; birthDate: string;
    phone: string; line: string; city: string; postalCode: string;
    contactRelCode: string; contactRelDisplay: string;
    contactFamily: string; contactGiven: string;
  };
  vitals: { systolic: number; diastolic: number; hr: number; rr: number; spo2: number; temp: number; weight: number };
  chiefComplaint: string;
  clinicalHistory: string;
  impression: { code: string; display: string; text: string };
  treatment: string;
  diagnostic: { conclusion: string; title: string };
  taskCodeText: string;
  taskNote: string;
};

export const DEFAULT_INPUT: ClinicalInput = {
  referralId: "REF-2026-000001",
  authoredOn: "2026-06-18T08:30",
  referralCategory: "emergency",
  serviceType: { code: "71388002", display: "Procedure" },
  reasonText: "Severe pre-eclampsia requiring IV antihypertensive, seizure prophylaxis, and maternal-fetal monitoring",
  referralNote:
    "Ana Reyes, 38-year-old G2P1, 32 weeks AOG. BP 180/110 mmHg with severe headache, dizziness, and blurring of vision. Proteinuria 3+. Referred for urgent management of severe pre-eclampsia.",
  encounterClass: "AMB",
  encounterClassDisplay: "ambulatory",
  selectedReceivingOrgId: "",
  selectedReceivingRoleId: "",
  selectedReceivingPractitionerId: "",
  patient: {
    philhealth: "78-658064775-3",
    philsys: "7731-0812-4491-0326",
    family: "Reyes",
    given: "Ana Luisa",
    gender: "female",
    birthDate: "1988-03-12",
    phone: "+63-919-876-5432",
    line: "Area 4, Barangay Mabuhay",
    city: "Kalibo",
    postalCode: "5600",
    contactRelCode: "HUSB",
    contactRelDisplay: "husband",
    contactFamily: "Reyes",
    contactGiven: "Roberto",
  },
  vitals: { systolic: 180, diastolic: 110, hr: 112, rr: 24, spo2: 96, temp: 36.8, weight: 72 },
  chiefComplaint: "Severe headache, dizziness, blurring of vision and epigastric pain for 2 days",
  clinicalHistory: "G2P1, 32 weeks AOG. EDD: Aug 20 2026. LMP: Nov 13 2025.",
  impression: { code: "398254007", display: "Pre-eclampsia", text: "Severe pre-eclampsia, 32 weeks AOG, G2P1" },
  treatment: "Pre-referral treatment given: Methyldopa 250mg BID, Folic Acid 5mg OD, FeSO4 300mg OD, CaCO3 500mg TID.",
  diagnostic: { conclusion: "Proteinuria 3+. Findings consistent with severe pre-eclampsia.", title: "Urinalysis Results" },
  taskCodeText: "eReferral for severe pre-eclampsia management",
  taskNote: "New referral for the patient. Awaiting receiving facility response.",
};

export type RequesterResources = { practitioner: any; organization: any; practitionerRole: any };
export type ReceivingResources = { organization: any; practitionerRole?: any; practitioner?: any };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const uuid = () => `urn:uuid:${crypto.randomUUID()}`;
const names = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** datetime-local (YYYY-MM-DDTHH:MM) -> FHIR dateTime with local offset. */
export const toFhirDateTime = (dt: string): string => {
  if (!dt) return dt;
  if (/[+-]\d{2}:\d{2}$|Z$/.test(dt)) return dt; // already has offset
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.abs(Math.floor(off / 60))).padStart(2, "0");
  const mm = String(Math.abs(off % 60)).padStart(2, "0");
  const base = dt.length === 16 ? `${dt}:00` : dt; // add seconds if missing
  return `${base}${sign}${hh}:${mm}`;
};

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Build a `text` element (status=generated) with a simple xhtml narrative. */
function narrative(type: string, id: string | undefined, lines: string[]) {
  const header = `<p class="res-header-id"><b>Generated Narrative: ${esc(type)}${id ? " " + esc(id) : ""}</b></p>`;
  const body = lines.filter(Boolean).map((l) => `<p>${l}</p>`).join("");
  // Resources carry language:"en", so the XHTML must declare both lang + xml:lang.
  return {
    status: "generated",
    div: `<div xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">${header}${body}</div>`,
  };
}

const humanName = (n?: any): string => {
  const name = Array.isArray(n) ? n[0] : n;
  if (!name) return "";
  if (name.text) return name.text;
  return [...(name.prefix || []), ...(name.given || []), name.family].filter(Boolean).join(" ");
};

function putEntry(fullUrl: string, resource: any, url: string) {
  return { fullUrl, resource, request: { method: "PUT", url } };
}
function postEntry(fullUrl: string, resource: any, type: string) {
  return { fullUrl, resource, request: { method: "POST", url: type } };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export function buildReferralBundle(
  i: ClinicalInput,
  requester: RequesterResources,
  receiving: ReceivingResources,
): any {
  const authored = toFhirDateTime(i.authoredOn);
  const eff = authored;

  // Existing master data — referenced by literal id (already on the server).
  const submissionRoleRef = `PractitionerRole/${requester.practitionerRole.id}`;
  const initiatingOrgRef = `Organization/${requester.organization.id}`;
  const receivingOrgRef = `Organization/${receiving.organization.id}`;
  const hasReceivingRole = !!receiving.practitionerRole?.id;
  const receivingRoleRef = hasReceivingRole ? `PractitionerRole/${receiving.practitionerRole.id}` : "";

  // Display labels for those references.
  const practName = humanName(requester.practitioner?.name);
  const initiatingOrgName = requester.organization?.name || "";
  const receivingOrgName = receiving.organization?.name || "";
  const receivingPractName = humanName(receiving.practitioner?.name);

  // urn:uuid fullUrls for the NEW resources this referral creates.
  // When an existing patient is selected, reference it by literal id and do not
  // re-create/upsert the Patient (only the new clinical + referral resources are sent).
  const patientRef = i.patientId ? `Patient/${i.patientId}` : uuid();
  const srRef = uuid();
  const encounterRef = uuid();
  const chiefRef = uuid();
  const impressionRef = uuid();
  const procRef = uuid();
  const drRef = uuid();
  const taskRef = uuid();
  const provRef = uuid();

  const entries: any[] = [];

  // ── 1. Patient (PUT by PhilSys, fallback PhilHealth) ─────────────────────
  // Skipped when an existing patient was selected — it's referenced by id instead.
  if (!i.patientId) {
    const patientIdentifiers = [
      ...(i.patient.philhealth ? [{ system: SYS.philhealth, value: i.patient.philhealth }] : []),
      ...(i.patient.philsys ? [{ system: SYS.philsys, value: i.patient.philsys }] : []),
    ];
    const patientName = [...names(i.patient.given), i.patient.family].filter(Boolean).join(" ");
    const patient: any = {
      resourceType: "Patient",
      meta: { profile: [PROFILE.patient] },
      language: "en",
      identifier: patientIdentifiers,
      active: true,
      name: [{ use: "official", family: i.patient.family, given: names(i.patient.given) }],
      telecom: i.patient.phone ? [{ system: "phone", value: i.patient.phone, use: "mobile" }] : undefined,
      gender: i.patient.gender,
      birthDate: i.patient.birthDate,
      address: [{
        use: "home",
        line: i.patient.line ? [i.patient.line] : undefined,
        city: i.patient.city || undefined,
        postalCode: i.patient.postalCode || undefined,
        country: "PH",
      }],
      contact: (i.patient.contactFamily || i.patient.contactGiven) ? [{
        relationship: [{ coding: [{ system: CS.roleCode, code: i.patient.contactRelCode, display: i.patient.contactRelDisplay }] }],
        name: { use: "official", family: i.patient.contactFamily, given: i.patient.contactGiven ? names(i.patient.contactGiven) : undefined },
      }] : undefined,
    };
    patient.text = narrative("Patient", undefined, [
      `Name: ${esc(patientName)}`,
      `Gender: ${esc(i.patient.gender)} · DoB: ${esc(i.patient.birthDate)}`,
      i.patient.philhealth ? `PhilHealth: ${esc(i.patient.philhealth)}` : "",
    ]);
    const patientPut = i.patient.philsys
      ? `Patient?identifier=${SYS.philsys}|${i.patient.philsys}`
      : `Patient?identifier=${SYS.philhealth}|${i.patient.philhealth}`;
    entries.push(putEntry(patientRef, patient, patientPut));
  }

  // Practitioner, Organizations and PractitionerRoles already exist on the server;
  // they are referenced by literal id (see refs above) and are NOT re-submitted.

  // ── ServiceRequest ───────────────────────────────────────────────────────
  const cat = REFERRAL_CATEGORY[i.referralCategory] || REFERRAL_CATEGORY.emergency;
  const sr: any = {
    resourceType: "ServiceRequest",
    meta: { profile: [PROFILE.serviceRequest] },
    language: "en",
    requisition: { system: "urn:oid:1.2.840.113619.21.1.2", value: i.referralId },
    status: "active",
    intent: "order",
    category: [{ coding: [{ system: CS.snomed, code: cat.code, display: cat.display }], text: cat.text }],
    subject: { reference: patientRef },
    encounter: { reference: encounterRef },
    occurrenceDateTime: authored,
    authoredOn: authored,
    requester: { reference: submissionRoleRef, display: practName || undefined },
    performer: [{ reference: receivingOrgRef, display: receivingOrgName || undefined }], // receiving ORGANIZATION
    reasonCode: [{ coding: [{ system: CS.snomed, code: i.serviceType.code, display: i.serviceType.display }], text: i.reasonText }],
    reasonReference: [{ reference: impressionRef }],
    note: i.referralNote ? [{ text: i.referralNote }] : undefined,
  };
  sr.text = narrative("ServiceRequest", undefined, [
    `Requisition: ${esc(i.referralId)} · Category: ${esc(cat.text)}`,
    `Reason: ${esc(i.reasonText)}`,
  ]);
  entries.push(postEntry(srRef, sr, "ServiceRequest"));

  // ── 8. Encounter ─────────────────────────────────────────────────────────
  const encounter: any = {
    resourceType: "Encounter",
    meta: { profile: [PROFILE.encounter] },
    language: "en",
    status: "finished",
    class: { system: CS.actCode, code: i.encounterClass, display: i.encounterClassDisplay },
    subject: { reference: patientRef },
  };
  encounter.text = narrative("Encounter", undefined, [`Status: finished · Class: ${esc(i.encounterClassDisplay)}`]);
  entries.push(postEntry(encounterRef, encounter, "Encounter"));

  // ── 9. Condition — chief complaint ───────────────────────────────────────
  const chief: any = {
    resourceType: "Condition",
    meta: { profile: [PROFILE.condition] },
    language: "en",
    clinicalStatus: { coding: [{ system: CS.conditionClinical, code: "active" }] },
    category: [{ coding: [{ system: CS.conditionCategory, code: "problem-list-item", display: "Problem List Item" }] }],
    code: { text: i.chiefComplaint },
    subject: { reference: patientRef },
    encounter: { reference: encounterRef },
    note: i.clinicalHistory ? [{ text: i.clinicalHistory }] : undefined,
  };
  chief.text = narrative("Condition", undefined, [`Chief complaint: ${esc(i.chiefComplaint)}`]);
  entries.push(postEntry(chiefRef, chief, "Condition"));

  // ── 10. Condition — working impression ───────────────────────────────────
  const impression: any = {
    resourceType: "Condition",
    meta: { profile: [PROFILE.condition] },
    language: "en",
    clinicalStatus: { coding: [{ system: CS.conditionClinical, code: "active" }] },
    verificationStatus: { coding: [{ system: CS.conditionVer, code: "provisional", display: "Provisional" }] },
    category: [{ coding: [{ system: CS.conditionCategory, code: "encounter-diagnosis", display: "Encounter Diagnosis" }] }],
    code: {
      coding: i.impression.code ? [{ system: CS.snomed, code: i.impression.code, display: i.impression.display }] : undefined,
      text: i.impression.text,
    },
    subject: { reference: patientRef },
    encounter: { reference: encounterRef },
    note: i.clinicalHistory ? [{ text: i.clinicalHistory }] : undefined,
  };
  impression.text = narrative("Condition", undefined, [`Working impression: ${esc(i.impression.text)}`]);
  entries.push(postEntry(impressionRef, impression, "Condition"));

  // ── 11–16. Vital-sign Observations ───────────────────────────────────────
  const VITALS = [
    {
      loinc: "85354-9", loincDisp: "Blood pressure panel with all children optional",
      snomed: "75367002", snomedDisp: "Blood pressure", panel: true,
      comps: [
        { loinc: "8480-6", loincDisp: "Systolic blood pressure", snomed: "271649006", snomedDisp: "Systolic blood pressure", value: i.vitals.systolic, unit: "mmHg", ucum: "mm[Hg]" },
        { loinc: "8462-4", loincDisp: "Diastolic blood pressure", snomed: "271650006", snomedDisp: "Diastolic blood pressure", value: i.vitals.diastolic, unit: "mmHg", ucum: "mm[Hg]" },
      ],
    },
    { loinc: "8867-4", loincDisp: "Heart rate", snomed: "78564009", snomedDisp: "Pulse rate", value: i.vitals.hr, unit: "beats/minute", ucum: "/min" },
    { loinc: "9279-1", loincDisp: "Respiratory rate", snomed: "86290005", snomedDisp: "Respiratory rate", value: i.vitals.rr, unit: "breaths/minute", ucum: "/min" },
    { loinc: "2708-6", loincDisp: "Oxygen saturation in Arterial blood", snomed: "103228002", snomedDisp: "Hemoglobin saturation with oxygen", value: i.vitals.spo2, unit: "%", ucum: "%" },
    { loinc: "8310-5", loincDisp: "Body temperature", snomed: "386725007", snomedDisp: "Body temperature", value: i.vitals.temp, unit: "Celsius", ucum: "Cel" },
    { loinc: "29463-7", loincDisp: "Body weight", snomed: "27113001", snomedDisp: "Body weight", value: i.vitals.weight, unit: "kg", ucum: "kg" },
  ] as any[];

  for (const v of VITALS) {
    const obs: any = {
      resourceType: "Observation",
      meta: { profile: [PROFILE.observation] },
      language: "en",
      status: "final",
      category: [{ coding: [{ system: CS.obsCategory, code: "vital-signs", display: "Vital Signs" }] }],
      code: { coding: [{ system: CS.loinc, code: v.loinc, display: v.loincDisp }, { system: CS.snomed, code: v.snomed, display: v.snomedDisp }] },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      effectiveDateTime: eff,
      performer: [{ reference: submissionRoleRef }],
    };
    if (v.panel) {
      obs.component = v.comps.map((c: any) => ({
        code: { coding: [{ system: CS.loinc, code: c.loinc, display: c.loincDisp }, { system: CS.snomed, code: c.snomed, display: c.snomedDisp }] },
        valueCodeableConcept: {
          coding: [{ system: CS.snomed, code: c.snomed, display: c.snomedDisp }],
          text: `${c.value} ${c.unit}`
        },
      }));
      obs.text = narrative("Observation", undefined, [`Blood pressure: ${esc(v.comps[0].value)}/${esc(v.comps[1].value)} mmHg`]);
    } else {
      obs.valueCodeableConcept = {
        coding: [{ system: CS.snomed, code: v.snomed, display: v.snomedDisp }],
        text: `${v.value} ${v.unit}`
      };
      obs.text = narrative("Observation", undefined, [`${esc(v.loincDisp)}: ${esc(v.value)} ${esc(v.unit)}`]);
    }
    entries.push(postEntry(uuid(), obs, "Observation"));
  }

  // ── 17. Procedure — treatment given ──────────────────────────────────────
  const procedure: any = {
    resourceType: "Procedure",
    meta: { profile: [PROFILE.procedure] },
    language: "en",
    status: "completed",
    code: { coding: [{ system: CS.snomed, code: "416608005", display: "Drug therapy" }] },
    subject: { reference: patientRef },
    encounter: { reference: encounterRef },
    note: i.treatment ? [{ text: i.treatment }] : undefined,
  };
  procedure.text = narrative("Procedure", undefined, [`Treatment: ${esc(i.treatment)}`]);
  entries.push(postEntry(procRef, procedure, "Procedure"));

  // ── 18. DiagnosticReport (no profile in the IG example) ──────────────────
  // No `contentType` on the attachment: this server's required MimeType binding
  // can't resolve urn:ietf:bcp:13, so any mime value errors — data alone is valid.
  const dr: any = {
    resourceType: "DiagnosticReport",
    language: "en",
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory" }] }],
    code: {
      coding: [{ system: CS.loinc, code: "24356-8", display: "Urinalysis complete panel - Urine" }],
      text: i.diagnostic.title || "Urinalysis",
    },
    subject: { reference: patientRef },
    encounter: { reference: encounterRef },
    effectiveDateTime: eff,
    performer: [{ reference: submissionRoleRef }],
    conclusion: i.diagnostic.conclusion || undefined,
    presentedForm: [{ title: i.diagnostic.title || undefined }],
  };
  dr.text = narrative("DiagnosticReport", undefined, [`Urinalysis · ${esc(i.diagnostic.conclusion)}`]);
  entries.push(postEntry(drRef, dr, "DiagnosticReport"));

  // ── 19. Task (owner = receiving PractitionerRole, else Organization) ─────
  const task: any = {
    resourceType: "Task",
    meta: { profile: [PROFILE.task] },
    language: "en",
    status: "requested",
    intent: "order",
    code: { coding: [{ system: CS.snomed, code: "3457005", display: "Patient referral" }], text: i.taskCodeText },
    focus: { reference: srRef },
    for: { reference: patientRef },
    authoredOn: authored,
    lastModified: authored,
    requester: { reference: submissionRoleRef, display: practName || undefined },
    owner: hasReceivingRole
      ? { reference: receivingRoleRef, display: receivingPractName || undefined }
      : { reference: receivingOrgRef, display: receivingOrgName || undefined }, // receiving PractitionerRole, else Organization
    note: i.taskNote ? [{ text: i.taskNote }] : undefined,
  };
  task.text = narrative("Task", undefined, [`Status: requested · ${esc(i.taskCodeText)}`]);
  entries.push(postEntry(taskRef, task, "Task"));

  // ── 20. Provenance (signature / audit) ───────────────────────────────────
  const provenance: any = {
    resourceType: "Provenance",
    meta: { profile: [PROFILE.provenance] },
    language: "en",
    target: [{ reference: srRef }],
    recorded: authored,
    activity: { coding: [{ system: CS.dataOperation, code: "CREATE", display: "create" }] },
    agent: [{
      type: { coding: [{ system: CS.provAgentType, code: "author", display: "Author" }] },
      who: { reference: submissionRoleRef },
      onBehalfOf: { reference: initiatingOrgRef },
    }],
    signature: [{
      type: [{ system: CS.signatureType, code: "1.2.840.10065.1.12.1.5", display: "Verification Signature" }],
      when: authored,
      who: { reference: submissionRoleRef },
      // No `sigFormat`: required MimeType binding is unresolvable on this server.
      data: SIGNATURE_DATA,
    }],
  };
  provenance.text = narrative("Provenance", undefined, [`Signed by ${esc(practName)} on behalf of ${esc(initiatingOrgName)}`]);
  entries.push(postEntry(provRef, provenance, "Provenance"));

  return {
    resourceType: "Bundle",
    language: "en",
    type: "transaction",
    timestamp: authored,
    entry: entries,
  };
}
