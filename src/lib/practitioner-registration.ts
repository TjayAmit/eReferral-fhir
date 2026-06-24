// Pure builders for the resources the "Create Practitioner" form submits.
//
// The admin Create Practitioner form (and the public /register flow) collect the
// same practitioner profile fields and then write two FHIR resources: a
// Practitioner and a PractitionerRole that links it to an Organization with a
// role code. Keeping the resource construction here (instead of inline in the
// React components) lets us unit-test it and reuse it across both flows.

import { roleCoding, type RoleOption } from "./practitioner-roles";

export const PRC_LICENSE_SYSTEM =
  "https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number";
export const ROLE_ID_SYSTEM =
  "https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id";
export const PRACTITIONER_PHONE = "+63-917-111-2233";

/** The practitioner-profile fields collected by the Create Practitioner form. */
export interface PractitionerFormData {
  givenName: string;
  familyName: string;
  prcLicense?: string;
  organizationId: string;
  /** Selected role — a RoleOption from the picker, or a bare code string. */
  role: RoleOption | string;
  active: boolean;
}

/** Build the Practitioner resource from the form. */
export function buildPractitioner(form: PractitionerFormData) {
  const identifier = form.prcLicense
    ? [{ system: PRC_LICENSE_SYSTEM, value: form.prcLicense }]
    : [];

  return {
    resourceType: "Practitioner" as const,
    identifier,
    active: form.active,
    name: [
      {
        use: "official",
        family: form.familyName,
        given: [form.givenName],
        prefix: ["Dr."],
      },
    ],
    telecom: [{ system: "phone", value: PRACTITIONER_PHONE, use: "work" }],
  };
}

/** Business identifier used for the PractitionerRole (stable, PRC-derived). */
export function makeRoleId(form: Pick<PractitionerFormData, "prcLicense">): string {
  return `ROLE-${form.prcLicense || Date.now()}`;
}

/**
 * Build the PractitionerRole that links the created Practitioner to its
 * Organization with the selected role code. `practitionerId` is the id returned
 * by the server after creating the Practitioner. `roleId` may be supplied for
 * deterministic output (tests); otherwise it is derived via makeRoleId.
 */
export function buildPractitionerRole(
  form: PractitionerFormData,
  practitionerId: string,
  roleId: string = makeRoleId(form)
) {
  return {
    resourceType: "PractitionerRole" as const,
    identifier: [{ system: ROLE_ID_SYSTEM, value: roleId }],
    active: form.active,
    practitioner: { reference: `Practitioner/${practitionerId}` },
    organization: { reference: `Organization/${form.organizationId}` },
    code: [{ coding: [roleCoding(form.role)] }],
  };
}
