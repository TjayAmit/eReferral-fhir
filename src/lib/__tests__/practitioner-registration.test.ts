import { describe, it, expect } from "vitest";
import {
  buildPractitioner,
  buildPractitionerRole,
  makeRoleId,
  PRC_LICENSE_SYSTEM,
  ROLE_ID_SYSTEM,
  PRACTITIONER_PHONE,
  type PractitionerFormData,
} from "../practitioner-registration";
import { ROLE_CODES, DEFAULT_ROLE_OPTION } from "../practitioner-roles";

// Sample data as it would come off the admin "Create Practitioner" form.
// (email/password are collected too but feed the local user account, not FHIR.)
const sampleForm: PractitionerFormData = {
  givenName: "Juan",
  familyName: "Dela Cruz",
  prcLicense: "123456",
  organizationId: "16723",
  role: ROLE_CODES.find((r) => r.display === "Doctor")!, // SNOMED 158965000
  active: true,
};

describe("buildPractitioner", () => {
  it("builds a Practitioner with name, telecom and active flag from the form", () => {
    const p = buildPractitioner(sampleForm);

    expect(p.resourceType).toBe("Practitioner");
    expect(p.active).toBe(true);
    expect(p.name).toEqual([
      { use: "official", family: "Dela Cruz", given: ["Juan"], prefix: ["Dr."] },
    ]);
    expect(p.telecom).toEqual([
      { system: "phone", value: PRACTITIONER_PHONE, use: "work" },
    ]);
  });

  it("includes the PRC license identifier when provided", () => {
    const p = buildPractitioner(sampleForm);
    expect(p.identifier).toEqual([
      { system: PRC_LICENSE_SYSTEM, value: "123456" },
    ]);
  });

  it("omits the identifier when no PRC license is given", () => {
    const p = buildPractitioner({ ...sampleForm, prcLicense: "" });
    expect(p.identifier).toEqual([]);
  });
});

describe("buildPractitionerRole", () => {
  it("links the practitioner and organization by reference", () => {
    const role = buildPractitionerRole(sampleForm, "16802");

    expect(role.resourceType).toBe("PractitionerRole");
    expect(role.active).toBe(true);
    expect(role.practitioner).toEqual({ reference: "Practitioner/16802" });
    expect(role.organization).toEqual({ reference: "Organization/16723" });
  });

  it("derives a stable role identifier from the PRC license", () => {
    const role = buildPractitionerRole(sampleForm, "16802");
    expect(role.identifier).toEqual([
      { system: ROLE_ID_SYSTEM, value: "ROLE-123456" },
    ]);
  });

  it("emits the proper SNOMED coding for the selected role", () => {
    const role = buildPractitionerRole(sampleForm, "16802");
    expect(role.code).toEqual([
      {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "158965000",
            display: "Doctor",
          },
        ],
      },
    ]);
  });

  it("falls back to the default role coding for a bare/unknown code", () => {
    const role = buildPractitionerRole({ ...sampleForm, role: "physician" }, "16802");
    expect(role.code[0].coding[0]).toEqual({
      system: DEFAULT_ROLE_OPTION.system,
      code: DEFAULT_ROLE_OPTION.code,
      display: DEFAULT_ROLE_OPTION.display,
    });
  });

  it("lets the caller supply a deterministic role id", () => {
    const role = buildPractitionerRole(sampleForm, "16802", "ROLE-FIXED");
    expect(role.identifier[0].value).toBe("ROLE-FIXED");
  });
});

describe("makeRoleId", () => {
  it("uses the PRC license when present", () => {
    expect(makeRoleId({ prcLicense: "123456" })).toBe("ROLE-123456");
  });

  it("falls back to a timestamp when no PRC license", () => {
    expect(makeRoleId({ prcLicense: "" })).toMatch(/^ROLE-\d+$/);
  });
});
