import { describe, it, expect } from "vitest";
import {
  buildPatient,
  relationshipDisplay,
  SAMPLE_PATIENT_FORM,
  EREF_PATIENT_PROFILE,
  PHILHEALTH_SYSTEM,
  PHILSYS_SYSTEM,
  RELATIONSHIP_SYSTEM,
  type PatientFormData,
} from "../patient-registration";

describe("buildPatient — demographics", () => {
  it("stamps the eReferral Patient profile", () => {
    const p = buildPatient(SAMPLE_PATIENT_FORM);
    expect(p.meta.profile).toEqual([EREF_PATIENT_PROFILE]);
    expect(p.resourceType).toBe("Patient");
  });

  it("maps name, gender and birthDate", () => {
    const p = buildPatient(SAMPLE_PATIENT_FORM);
    expect(p.name).toEqual([{ use: "official", family: "Reyes", given: ["Ana"] }]);
    expect(p.gender).toBe("female");
    expect(p.birthDate).toBe("1988-03-12");
  });

  it("includes PhilHealth and PhilSys identifiers when present", () => {
    const p = buildPatient(SAMPLE_PATIENT_FORM);
    expect(p.identifier).toEqual([
      { system: PHILHEALTH_SYSTEM, value: "78-658064775-3" },
      { system: PHILSYS_SYSTEM, value: "7731-0812-4491-0326" },
    ]);
  });

  it("builds a home address with line, city, province and postal code", () => {
    const p = buildPatient(SAMPLE_PATIENT_FORM);
    expect(p.address).toEqual([
      {
        use: "home",
        line: ["Area 4", "Barangay Mabuhay"],
        city: "Kalibo",
        state: "Aklan",
        postalCode: "5600",
        country: "PH",
      },
    ]);
  });

  it("omits address entirely when no address fields are given", () => {
    const form: PatientFormData = {
      ...SAMPLE_PATIENT_FORM,
      addressLine: "",
      barangay: "",
      city: "",
      province: "",
      postalCode: "",
    };
    expect(buildPatient(form).address).toBeUndefined();
  });
});

describe("buildPatient — next of kin", () => {
  it("records next of kin as a contact with relationship coding", () => {
    const p = buildPatient(SAMPLE_PATIENT_FORM);
    expect(p.contact).toEqual([
      {
        relationship: [
          { coding: [{ system: RELATIONSHIP_SYSTEM, code: "HUSB", display: "Husband" }] },
        ],
        name: { use: "official", family: "Reyes", given: ["Roberto"] },
        telecom: [{ system: "phone", value: "+63-918-111-2222", use: "mobile" }],
      },
    ]);
  });

  it("omits contact when next of kin has no name", () => {
    const p = buildPatient({
      ...SAMPLE_PATIENT_FORM,
      nextOfKin: { relationship: "SPS", givenName: "", familyName: "" },
    });
    expect(p.contact).toBeUndefined();
  });
});

describe("relationshipDisplay", () => {
  it("resolves known codes and echoes unknown ones", () => {
    expect(relationshipDisplay("MTH")).toBe("Mother");
    expect(relationshipDisplay("ZZZ")).toBe("ZZZ");
  });
});
