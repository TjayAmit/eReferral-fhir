// eReferral domain logic for Track 1.
// Builds the Use Case 1 transaction Bundle and extracts data elements for Use Case 2.
// Element mapping is per the README AC tables (the authoritative source):
//   1.14 Referral Category            -> ServiceRequest.priority
//   1.15 Reason for Referral (svc)    -> ServiceRequest.category
//   Demographics/metadata = conditional PUT by identifier; clinical data = POST.

// ---- Identifier systems (README "Conditional Update (PUT) Pattern" table) ----
export const SYS = {
  nhfr: "https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code",
  hcpn: "https://fhir.doh.gov.ph/phcore/Identifier/hcpn-code",
  prc: "https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number",
  philhealth: "http://philhealth.gov.ph/fhir/Identifier/philhealth-id",
  philsys: "http://philsys.gov.ph/fhir/Identifier/philsys-id",
  reasonForReferral: "https://www.fhir.doh.gov.ph/pheref/CodeSystem/reason-for-referral-service-type",
  practitionerRole: "https://www.fhir.doh.gov.ph/pheref/CodeSystem/practitioner-role",
  loinc: "http://loinc.org",
  snomed: "http://snomed.info/sct",
};

export type ReferralInput = {
  referralId: string;
  authoredOn: string;
  priority: string; // 1.14 Referral Category (urgent | stat | asap | routine)
  reason: { code: string; display: string }; // 1.15 Reason for Referral
  referrer: { prc: string; family: string; given: string; prefix: string };
  navigator: { prc: string; family: string; given: string };
  initiating: { nhfr: string; hcpn: string; name: string; phone: string; line: string; city: string; postalCode: string };
  receiving: { nhfr: string; name: string; city: string; postalCode: string };
  patient: {
    philhealth: string; philsys: string; family: string; given: string;
    gender: string; birthDate: string; phone: string;
    line: string; city: string; postalCode: string;
    contactName: string; contactPhone: string;
  };
  vitals: { systolic: number; diastolic: number; hr: number; rr: number; spo2: number; temp: number; weight: number };
  chiefComplaint: string;   // 1.29
  clinicalHistory: string;  // 1.30
  impression: { code: string; display: string; text: string }; // 1.31
  treatment: string;        // 1.38
};

// Tiny placeholder attachments (1px PNG signature, 1-page PDF) — valid base64.
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF_STUB =
  "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoK";

export const DEFAULT_REFERRAL: ReferralInput = {
  referralId: "REF-2026-001234",
  authoredOn: "2026-06-18T08:30:00+08:00",
  priority: "urgent",
  reason: { code: "398254007", display: "Pre-eclampsia" },
  referrer: { prc: "0123456", family: "Bautista", given: "Maria Clara", prefix: "Dr." },
  navigator: { prc: "0987654", family: "Delgado", given: "Josefa" },
  initiating: {
    nhfr: "3056", hcpn: "R6-AKL-001", name: "Kalibo Health Center",
    phone: "+63-36-268-1234", line: "Roxas Avenue", city: "Kalibo", postalCode: "5600",
  },
  receiving: { nhfr: "513", name: "Dr. Rafael S. Tumbokon Memorial Hospital (DRSTMH)", city: "Kalibo", postalCode: "5600" },
  patient: {
    philhealth: "78-658064775-3", philsys: "7731-0812-4491-0326",
    family: "Reyes", given: "Ana Luisa", gender: "female", birthDate: "1988-03-12",
    phone: "+63-919-876-5432", line: "Area 4, Barangay Mabuhay", city: "Kalibo", postalCode: "5600",
    contactName: "Roberto Reyes", contactPhone: "+63-918-222-3344",
  },
  vitals: { systolic: 180, diastolic: 110, hr: 112, rr: 22, spo2: 97, temp: 37.0, weight: 68 },
  chiefComplaint: "Severe headache, dizziness, blurring of vision and epigastric pain for 2 days",
  clinicalHistory: "G2P1, 32 weeks AOG. EDD: Aug 20 2026. LMP: Nov 13 2025.",
  impression: { code: "398254007", display: "Pre-eclampsia", text: "Severe pre-eclampsia, 32 weeks AOG, G2P1" },
  treatment: "Pre-referral: Methyldopa 250mg BID; MgSO4 loading dose started for seizure prophylaxis.",
};

const names = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const uuid = () => `urn:uuid:${crypto.randomUUID()}`;

function vital(ref: string, subject: string, effective: string, loinc: string, display: string, value: number, unit: string, ucum: string) {
  return {
    fullUrl: ref,
    request: { method: "POST", url: "Observation" },
    resource: {
      resourceType: "Observation",
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }],
      code: { coding: [{ system: SYS.loinc, code: loinc, display }] },
      subject: { reference: subject },
      effectiveDateTime: effective,
      valueQuantity: { value, unit, system: "http://unitsofmeasure.org", code: ucum },
    },
  };
}

/** Build the Use Case 1 eReferral transaction Bundle (AC 1.01–1.39). */
export function buildReferralBundle(i: ReferralInput) {
  const referrerRef = uuid();
  const navigatorRef = uuid();
  const initiatingRef = uuid();
  const receivingRef = uuid();
  const roleRef = uuid();
  const patientRef = uuid();
  const chiefRef = uuid();
  const impressionRef = uuid();
  const srRef = uuid();
  const provRef = uuid();
  const procRef = uuid();
  const drRef = uuid();
  const taskRef = uuid();
  const eff = "2026-06-18T08:15:00+08:00";

  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      // 1.01 Referring practitioner (PUT, conditional by PRC license)
      {
        fullUrl: referrerRef,
        request: { method: "PUT", url: `Practitioner?identifier=${SYS.prc}|${i.referrer.prc}` },
        resource: {
          resourceType: "Practitioner",
          identifier: [{ system: SYS.prc, value: i.referrer.prc }],
          active: true,
          name: [{ use: "official", family: i.referrer.family, given: names(i.referrer.given), prefix: i.referrer.prefix ? [i.referrer.prefix] : undefined }],
        },
      },
      // 1.02 Care navigator (PUT)
      {
        fullUrl: navigatorRef,
        request: { method: "PUT", url: `Practitioner?identifier=${SYS.prc}|${i.navigator.prc}` },
        resource: {
          resourceType: "Practitioner",
          identifier: [{ system: SYS.prc, value: i.navigator.prc }],
          active: true,
          name: [{ use: "official", family: i.navigator.family, given: names(i.navigator.given) }],
        },
      },
      // 1.06–1.09 + 1.12 Initiating facility (PUT) with NHFR + HCPN
      {
        fullUrl: initiatingRef,
        request: { method: "PUT", url: `Organization?identifier=${SYS.nhfr}|${i.initiating.nhfr}` },
        resource: {
          resourceType: "Organization",
          identifier: [
            { system: SYS.nhfr, value: i.initiating.nhfr },
            { system: SYS.hcpn, value: i.initiating.hcpn },
          ],
          active: true,
          name: i.initiating.name,
          telecom: [{ system: "phone", value: i.initiating.phone, use: "work" }],
          address: [{ use: "work", line: [i.initiating.line], city: i.initiating.city, postalCode: i.initiating.postalCode, country: "PH" }],
        },
      },
      // 1.10–1.11 Receiving facility (PUT)
      {
        fullUrl: receivingRef,
        request: { method: "PUT", url: `Organization?identifier=${SYS.nhfr}|${i.receiving.nhfr}` },
        resource: {
          resourceType: "Organization",
          identifier: [{ system: SYS.nhfr, value: i.receiving.nhfr }],
          active: true,
          name: i.receiving.name,
          address: [{ use: "work", city: i.receiving.city, postalCode: i.receiving.postalCode, country: "PH" }],
        },
      },
      // 1.03 PractitionerRole (PUT)
      {
        fullUrl: roleRef,
        request: { method: "PUT", url: `PractitionerRole?identifier=https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id|ROLE-${i.referralId}` },
        resource: {
          resourceType: "PractitionerRole",
          identifier: [{ system: "https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id", value: `ROLE-${i.referralId}` }],
          active: true,
          practitioner: { reference: referrerRef },
          organization: { reference: initiatingRef },
          code: [{ coding: [{ system: SYS.practitionerRole, code: "physician", display: "Physician" }] }],
        },
      },
      // 1.19–1.27 Patient (PUT by PhilHealth)
      {
        fullUrl: patientRef,
        request: { method: "PUT", url: `Patient?identifier=${SYS.philhealth}|${i.patient.philhealth}` },
        resource: {
          resourceType: "Patient",
          identifier: [
            { system: SYS.philhealth, value: i.patient.philhealth },
            { system: SYS.philsys, value: i.patient.philsys },
          ],
          active: true,
          name: [{ use: "official", family: i.patient.family, given: names(i.patient.given) }],
          telecom: [{ system: "phone", value: i.patient.phone, use: "mobile" }],
          gender: i.patient.gender,
          birthDate: i.patient.birthDate,
          address: [{ use: "home", line: [i.patient.line], city: i.patient.city, postalCode: i.patient.postalCode, country: "PH" }],
          contact: [{
            relationship: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-RoleCode", code: "HUSB", display: "husband" }] }],
            name: { use: "official", text: i.patient.contactName },
            telecom: [{ system: "phone", value: i.patient.contactPhone, use: "mobile" }],
          }],
        },
      },
      // 1.13–1.15 ServiceRequest (PUT by referral identifier)
      {
        fullUrl: srRef,
        request: { method: "PUT", url: `ServiceRequest?identifier=${i.referralId}` },
        resource: {
          resourceType: "ServiceRequest",
          identifier: [{ value: i.referralId }],
          status: "active",
          intent: "order",
          priority: i.priority, // 1.14 Referral Category
          category: [{ // 1.15 Reason for Referral (service type)
            coding: [{ system: SYS.reasonForReferral, code: i.reason.code, display: i.reason.display }],
            text: "Reason for referral (service type)",
          }],
          subject: { reference: patientRef },
          authoredOn: i.authoredOn, // 1.13
          requester: { reference: referrerRef },
          performer: [{ reference: receivingRef }],
          reasonReference: [{ reference: impressionRef }],
        },
      },
      // 1.04–1.05 Provenance (POST) with signature
      {
        fullUrl: provRef,
        request: { method: "POST", url: "Provenance" },
        resource: {
          resourceType: "Provenance",
          target: [{ reference: srRef }],
          recorded: i.authoredOn, // 1.04
          agent: [{
            type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type", code: "author" }] },
            who: { reference: referrerRef },
          }],
          signature: [{ // 1.05
            type: [{ system: "urn:iso-astm:E1762-95:2013", code: "1.2.840.10065.1.12.1.1", display: "Author's Signature" }],
            when: i.authoredOn,
            who: { reference: referrerRef },
            sigFormat: "image/png",
            data: PNG_1PX,
          }],
        },
      },
      // 1.29–1.30 Chief complaint (POST)
      {
        fullUrl: chiefRef,
        request: { method: "POST", url: "Condition" },
        resource: {
          resourceType: "Condition",
          clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
          category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item", display: "Problem List Item" }] }],
          code: { text: i.chiefComplaint },
          subject: { reference: patientRef },
          note: [{ text: i.clinicalHistory }],
        },
      },
      // 1.31 Working impression (POST)
      {
        fullUrl: impressionRef,
        request: { method: "POST", url: "Condition" },
        resource: {
          resourceType: "Condition",
          clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
          verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "provisional" }] },
          category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "encounter-diagnosis", display: "Encounter Diagnosis" }] }],
          code: { coding: [{ system: SYS.snomed, code: i.impression.code, display: i.impression.display }], text: i.impression.text },
          subject: { reference: patientRef },
        },
      },
      // 1.32 BP (component systolic/diastolic)
      {
        fullUrl: uuid(),
        request: { method: "POST", url: "Observation" },
        resource: {
          resourceType: "Observation",
          status: "final",
          category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }],
          code: { coding: [{ system: SYS.loinc, code: "85354-9", display: "Blood pressure panel with all children optional" }] },
          subject: { reference: patientRef },
          effectiveDateTime: eff,
          component: [
            { code: { coding: [{ system: SYS.loinc, code: "8480-6", display: "Systolic blood pressure" }] }, valueQuantity: { value: i.vitals.systolic, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" } },
            { code: { coding: [{ system: SYS.loinc, code: "8462-4", display: "Diastolic blood pressure" }] }, valueQuantity: { value: i.vitals.diastolic, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" } },
          ],
        },
      },
      // 1.33–1.37 HR, RR, SpO2, Temp, Weight
      vital(uuid(), patientRef, eff, "8867-4", "Heart rate", i.vitals.hr, "beats/minute", "/min"),
      vital(uuid(), patientRef, eff, "9279-1", "Respiratory rate", i.vitals.rr, "breaths/minute", "/min"),
      vital(uuid(), patientRef, eff, "2708-6", "Oxygen saturation in Arterial blood", i.vitals.spo2, "%", "%"),
      vital(uuid(), patientRef, eff, "8310-5", "Body temperature", i.vitals.temp, "Cel", "Cel"),
      vital(uuid(), patientRef, eff, "29463-7", "Body weight", i.vitals.weight, "kg", "kg"),
      // 1.38 Treatment given (POST)
      {
        fullUrl: procRef,
        request: { method: "POST", url: "Procedure" },
        resource: {
          resourceType: "Procedure",
          status: "completed",
          code: { coding: [{ system: SYS.snomed, code: "416608005", display: "Drug therapy" }] },
          subject: { reference: patientRef },
          note: [{ text: i.treatment }],
        },
      },
      // 1.39 Laboratory results (POST) with attachment
      {
        fullUrl: drRef,
        request: { method: "POST", url: "DiagnosticReport" },
        resource: {
          resourceType: "DiagnosticReport",
          status: "final",
          category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory" }] }],
          code: { coding: [{ system: SYS.loinc, code: "11502-2", display: "Laboratory report" }] },
          subject: { reference: patientRef },
          effectiveDateTime: "2026-06-18T08:20:00+08:00",
          presentedForm: [{ contentType: "application/pdf", title: "Urinalysis — proteinuria 3+", data: PDF_STUB }],
        },
      },
      // 1.16–1.18 Task (PUT by referral identifier)
      {
        fullUrl: taskRef,
        request: { method: "PUT", url: `Task?identifier=${i.referralId}` },
        resource: {
          resourceType: "Task",
          identifier: [{ value: i.referralId }],
          status: "requested",
          intent: "order",
          priority: i.priority,
          code: { coding: [{ system: SYS.snomed, code: "3457005", display: "Patient referral" }] },
          focus: { reference: srRef },
          for: { reference: patientRef },
          authoredOn: i.authoredOn, // 1.16
          requester: { reference: initiatingRef },
          owner: { reference: receivingRef },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Use Case 2 — extract & format helpers
// ---------------------------------------------------------------------------

export const humanName = (n?: any): string => {
  const name = Array.isArray(n) ? n[0] : n;
  if (!name) return "—";
  if (name.text) return name.text;
  return [...(name.prefix || []), ...(name.given || []), name.family].filter(Boolean).join(" ") || "—";
};

export const formatAddress = (a?: any): string => {
  const ad = Array.isArray(a) ? a[0] : a;
  if (!ad) return "—";
  return [...(ad.line || []), ad.city, ad.postalCode, ad.country].filter(Boolean).join(", ") || "—";
};

export const firstPhone = (t?: any[]): string =>
  (t || []).find((x) => x.system === "phone")?.value || "—";

export type ReferralView = {
  byType: Record<string, any[]>;
  resources: any[];
};

/** Group the $everything Bundle entries by resourceType for display, deduped by id. */
export function extractReferral(bundle: any): ReferralView {
  const seen = new Set<string>();
  const resources: any[] = [];
  for (const e of bundle?.entry || []) {
    const r = e.resource;
    if (!r) continue;
    const key = `${r.resourceType}/${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resources.push(r);
  }
  const byType: Record<string, any[]> = {};
  for (const r of resources) {
    (byType[r.resourceType] ||= []).push(r);
  }
  return { byType, resources };
}

export const ACTION_POINTS: { label: string; status: string; note?: boolean }[] = [
  { label: "Mark Received", status: "received" }, // 2.17
  { label: "Accept", status: "accepted" },        // 2.18
  { label: "Reject", status: "rejected", note: true },
  { label: "Complete", status: "completed" },
];

/** JSON-Patch ops for an action-point update. */
export function actionPatch(status: string, reason?: string) {
  const ops: any[] = [
    { op: "replace", path: "/status", value: status },
    { op: "add", path: "/lastModified", value: new Date().toISOString() },
  ];
  if (reason) ops.push({ op: "add", path: "/statusReason", value: { text: reason } });
  return ops;
}
