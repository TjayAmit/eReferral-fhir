import { describe, it, expect } from "vitest";
import { applyDisposition, withEncounterStatus, sanitizeEncounter } from "../disposition";

const ER = {
  resourceType: "Encounter",
  id: "19864",
  status: "triaged",
  class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "EMER", display: "emergency" },
  type: [{ coding: [{ system: "http://snomed.info/sct", code: "225390008", display: "Triage" }] }],
  subject: { reference: "Patient/19862" },
  serviceProvider: { reference: "Organization/16723" },
  reasonCode: [{ coding: [{ system: "http://snomed.info/sct", code: "73770003", display: "Emergency" }] }],
  text: { status: "generated", div: "<div>stale</div>" },
  period: { start: "2026-06-25T08:00:00+08:00" },
};

describe("sanitizeEncounter", () => {
  it("drops stale narrative and removes the bad triage reasonCode", () => {
    const e = sanitizeEncounter(ER);
    expect(e.text).toBeUndefined();
    expect(e.reasonCode).toBeUndefined();
  });
  it("does not mutate the input", () => {
    sanitizeEncounter(ER);
    expect(ER.text).toBeDefined();
    expect(ER.reasonCode).toBeDefined();
  });
});

describe("withEncounterStatus (Step 2)", () => {
  it("returns the encounter with the new status, id preserved", () => {
    const e = withEncounterStatus(ER, "in-progress");
    expect(e.status).toBe("in-progress");
    expect(e.id).toBe("19864");
    expect(e.text).toBeUndefined(); // sanitized
  });
});

describe("applyDisposition (Step 4)", () => {
  it("Discharge → finished + dischargeDisposition home, end time set, no inpatient", () => {
    const { er, inpatient } = applyDisposition(ER, "19862", "discharge", "2026-06-25T10:00:00+08:00");
    expect(inpatient).toBeUndefined();
    expect(er.status).toBe("finished");
    expect(er.period.end).toBe("2026-06-25T10:00:00+08:00");
    expect(er.hospitalization.dischargeDisposition.coding[0].code).toBe("home");
  });

  it("Transfer → finished + dischargeDisposition other-hcf (transferred)", () => {
    const { er } = applyDisposition(ER, "19862", "transfer");
    expect(er.status).toBe("finished");
    expect(er.hospitalization.dischargeDisposition.coding[0].code).toBe("other-hcf");
    expect(er.hospitalization.dischargeDisposition.text).toMatch(/transferred/i);
  });

  it("Admit → ER finished + a separate inpatient Encounter for the same patient", () => {
    const { er, inpatient } = applyDisposition(ER, "19862", "admit");
    expect(er.status).toBe("finished");
    expect(inpatient).toBeTruthy();
    expect(inpatient.resourceType).toBe("Encounter");
    expect(inpatient.status).toBe("in-progress");
    expect(inpatient.class.code).toBe("IMP");
    expect(inpatient.subject).toEqual({ reference: "Patient/19862" });
    expect(inpatient.partOf).toEqual({ reference: "Encounter/19864" });
    expect(inpatient.serviceProvider).toEqual({ reference: "Organization/16723" });
    // inpatient is a fresh resource — must NOT carry the ER's id
    expect(inpatient.id).toBeUndefined();
  });
});
