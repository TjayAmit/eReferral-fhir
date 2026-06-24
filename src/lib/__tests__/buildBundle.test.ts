import { describe, it, expect } from "vitest";
import { buildReferralBundle, DEFAULT_INPUT } from "../buildBundle";

const requester = {
  practitioner: { id: "P1", name: [{ given: ["Maria"], family: "Bautista" }] },
  organization: { id: "O1", name: "Kalibo Health Center" },
  practitionerRole: { id: "PR1" },
};
const receiving = { organization: { id: "O2", name: "DRSTMH" } };

const types = (b: any) => b.entry.map((e: any) => e.resource.resourceType);
const srSubject = (b: any) =>
  b.entry.find((e: any) => e.resource.resourceType === "ServiceRequest").resource.subject.reference;

describe("buildReferralBundle — existing patient reference", () => {
  it("creates a Patient entry when no patientId is given (manual entry)", () => {
    const b = buildReferralBundle(DEFAULT_INPUT, requester, receiving);
    expect(types(b)).toContain("Patient");
    expect(srSubject(b)).toMatch(/^urn:uuid:/); // references the in-bundle Patient
  });

  it("references Patient/<id> and omits the Patient entry when a patient is selected", () => {
    const b = buildReferralBundle({ ...DEFAULT_INPUT, patientId: "16802" }, requester, receiving);
    expect(types(b)).not.toContain("Patient");
    expect(srSubject(b)).toBe("Patient/16802");
  });

  it("still wires the rest of the referral (ServiceRequest, Encounter, Task) to the existing patient", () => {
    const b = buildReferralBundle({ ...DEFAULT_INPUT, patientId: "16802" }, requester, receiving);
    const t = types(b);
    expect(t).toEqual(expect.arrayContaining(["ServiceRequest", "Encounter", "Task"]));
    // every subject/for reference that points at a patient uses the literal id
    const patientRefs = JSON.stringify(b).match(/"Patient\/[^"']+"/g) || [];
    for (const r of patientRefs) expect(r).toBe('"Patient/16802"');
  });
});
