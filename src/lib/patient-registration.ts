// Pure builders for the Patient resource registered at triage (the first step).
//
// Triage registers a patient's demographics and next of kin, and assigns them to
// the Organization they presented to via Patient.managingOrganization. The shape
// follows the PH eReferral Patient profile (ereferral-patient): PhilHealth /
// PhilSys identifiers, official name, gender, birthDate, home address, and a
// `contact` entry for next of kin. Kept here (not inline in the page) so it can
// be unit-tested and reused.

export const EREF_PATIENT_PROFILE =
  "https://fhir.doh.gov.ph/pheref/StructureDefinition/ereferral-patient";
export const PHILHEALTH_SYSTEM =
  "http://philhealth.gov.ph/fhir/Identifier/philhealth-id";
export const PHILSYS_SYSTEM = "http://philsys.gov.ph/fhir/Identifier/philsys-id";
export const RELATIONSHIP_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/v3-RoleCode";

/** Administrative gender (FHIR administrative-gender value set). */
export const GENDERS = ["male", "female", "other", "unknown"] as const;
export type Gender = (typeof GENDERS)[number];

/** Next-of-kin relationship codes (HL7 v3 RoleCode), as used by the IG example. */
export const RELATIONSHIP_CODES = [
  { code: "SPS",   display: "Spouse" },
  { code: "HUSB",  display: "Husband" },
  { code: "WIFE",  display: "Wife" },
  { code: "MTH",   display: "Mother" },
  { code: "FTH",   display: "Father" },
  { code: "SON",   display: "Son" },
  { code: "DAU",   display: "Daughter" },
  { code: "BRO",   display: "Brother" },
  { code: "SIS",   display: "Sister" },
  { code: "GRPRN", display: "Grandparent" },
  { code: "GUARD", display: "Guardian" },
  { code: "FRND",  display: "Friend" },
] as const;

export type RelationshipCode = (typeof RELATIONSHIP_CODES)[number]["code"];

export function relationshipDisplay(code: string): string {
  return RELATIONSHIP_CODES.find((r) => r.code === code)?.display ?? code;
}

export interface NextOfKin {
  relationship: string; // RoleCode, e.g. "SPS"
  givenName: string;
  familyName: string;
  phone?: string;
}

/** Fields collected by the triage / patient-registration form. */
export interface PatientFormData {
  philhealth?: string;
  philsys?: string;
  givenName: string;
  familyName: string;
  gender: Gender | string;
  birthDate: string; // YYYY-MM-DD
  phone?: string;
  addressLine?: string;
  barangay?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  nextOfKin?: NextOfKin;
  active: boolean;
}

/** Build the eReferral Patient resource from the triage form. */
export function buildPatient(form: PatientFormData) {
  const identifier: { system: string; value: string }[] = [];
  if (form.philhealth) identifier.push({ system: PHILHEALTH_SYSTEM, value: form.philhealth });
  if (form.philsys) identifier.push({ system: PHILSYS_SYSTEM, value: form.philsys });

  const patient: any = {
    resourceType: "Patient",
    meta: { profile: [EREF_PATIENT_PROFILE] },
    identifier,
    active: form.active,
    name: [{ use: "official", family: form.familyName, given: [form.givenName] }],
    gender: form.gender,
    birthDate: form.birthDate,
  };

  if (form.phone) {
    patient.telecom = [{ system: "phone", value: form.phone, use: "mobile" }];
  }

  const line = [form.addressLine, form.barangay].filter(Boolean) as string[];
  if (line.length || form.city || form.province || form.postalCode) {
    patient.address = [
      {
        use: "home",
        ...(line.length ? { line } : {}),
        ...(form.city ? { city: form.city } : {}),
        ...(form.province ? { state: form.province } : {}),
        ...(form.postalCode ? { postalCode: form.postalCode } : {}),
        country: "PH",
      },
    ];
  }

  const kin = form.nextOfKin;
  if (kin && (kin.givenName || kin.familyName)) {
    patient.contact = [
      {
        relationship: [
          {
            coding: [
              {
                system: RELATIONSHIP_SYSTEM,
                code: kin.relationship,
                display: relationshipDisplay(kin.relationship),
              },
            ],
          },
        ],
        name: { use: "official", family: kin.familyName, given: [kin.givenName] },
        ...(kin.phone
          ? { telecom: [{ system: "phone", value: kin.phone, use: "mobile" }] }
          : {}),
      },
    ];
  }

  return patient;
}

/** Sample triage registration (used by tests / docs). */
export const SAMPLE_PATIENT_FORM: PatientFormData = {
  philhealth: "78-658064775-3",
  philsys: "7731-0812-4491-0326",
  givenName: "Ana",
  familyName: "Reyes",
  gender: "female",
  birthDate: "1988-03-12",
  phone: "+63-919-876-5432",
  addressLine: "Area 4",
  barangay: "Barangay Mabuhay",
  city: "Kalibo",
  province: "Aklan",
  postalCode: "5600",
  nextOfKin: {
    relationship: "HUSB",
    givenName: "Roberto",
    familyName: "Reyes",
    phone: "+63-918-111-2222",
  },
  active: true,
};
