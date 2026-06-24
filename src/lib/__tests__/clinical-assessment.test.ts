import { describe, it, expect } from "vitest";
import {
  buildClinicalBundle,
  SAMPLE_ASSESSMENT,
  VITALS_NOT_FETCHED_REASONS,
  EMERGENCY_TRIAGE_TYPE,
  type ClinicalAssessmentInput,
} from "../clinical-assessment";

const byType = (bundle: any, t: string) =>
  bundle.entry.map((e: any) => e.resource).filter((r: any) => r.resourceType === t);

describe("buildClinicalBundle", () => {
  it("produces a transaction Bundle", () => {
    const b = buildClinicalBundle(SAMPLE_ASSESSMENT);
    expect(b.resourceType).toBe("Bundle");
    expect(b.type).toBe("transaction");
  });

  it("creates exactly one Encounter linking patient, doctor and service provider", () => {
    const enc = byType(buildClinicalBundle(SAMPLE_ASSESSMENT), "Encounter");
    expect(enc).toHaveLength(1);
    expect(enc[0].subject).toEqual({ reference: "Patient/16802" });
    expect(enc[0].participant[0].individual).toEqual({ reference: "Practitioner/16805" });
    expect(enc[0].serviceProvider).toEqual({ reference: "Organization/16723" });
    expect(enc[0].status).toBe("finished");
  });

  it("records a BP panel plus one Observation per supplied vital", () => {
    const obs = byType(buildClinicalBundle(SAMPLE_ASSESSMENT), "Observation");
    // BP panel + hr, rr, spo2, temp, weight = 6 (height not supplied in sample)
    expect(obs).toHaveLength(6);
    const bp = obs.find((o: any) => o.code.coding[0].code === "85354-9");
    expect(bp.component.map((c: any) => c.valueQuantity.value)).toEqual([150, 95]);
  });

  it("links every clinical resource to the Encounter and the Patient", () => {
    const b = buildClinicalBundle(SAMPLE_ASSESSMENT);
    const encFullUrl = b.entry.find((e: any) => e.resource.resourceType === "Encounter").fullUrl;
    const clinical = b.entry
      .map((e: any) => e.resource)
      .filter((r: any) => r.resourceType !== "Encounter");
    for (const r of clinical) {
      expect(r.subject).toEqual({ reference: "Patient/16802" });
      expect(r.encounter).toEqual({ reference: encFullUrl });
    }
  });

  it("records chief complaint and diagnosis as two Conditions with correct categories", () => {
    const cond = byType(buildClinicalBundle(SAMPLE_ASSESSMENT), "Condition");
    const categories = cond.map((c: any) => c.category[0].coding[0].code).sort();
    expect(categories).toEqual(["encounter-diagnosis", "problem-list-item"]);
    const dx = cond.find((c: any) => c.category[0].coding[0].code === "encounter-diagnosis");
    expect(dx.code.coding[0]).toEqual({
      system: "http://snomed.info/sct",
      code: "38341003",
      display: "Hypertensive disorder",
    });
  });

  it("records treatment as a Procedure", () => {
    const proc = byType(buildClinicalBundle(SAMPLE_ASSESSMENT), "Procedure");
    expect(proc).toHaveLength(1);
    expect(proc[0].note[0].text).toContain("antihypertensive");
  });

  it("models an emergency-triage in-progress encounter when requested", () => {
    const b = buildClinicalBundle({
      ...SAMPLE_ASSESSMENT,
      encounterStatus: "in-progress",
      encounterClass: { code: "EMER", display: "emergency" },
      encounterType: EMERGENCY_TRIAGE_TYPE,
    });
    const enc = b.entry.map((e: any) => e.resource).find((r: any) => r.resourceType === "Encounter");
    expect(enc.status).toBe("in-progress");
    expect(enc.class.code).toBe("EMER");
    expect(enc.type[0].coding[0]).toEqual({
      system: "http://snomed.info/sct",
      code: "225390008",
      display: "Triage",
    });
  });

  it("stores the originating organization in Encounter.hospitalization.origin", () => {
    const b = buildClinicalBundle({ ...SAMPLE_ASSESSMENT, originOrganizationId: "16177" });
    const enc = b.entry.map((e: any) => e.resource).find((r: any) => r.resourceType === "Encounter");
    expect(enc.hospitalization?.origin).toEqual({ reference: "Organization/16177" });
    // serviceProvider remains the responsible org (from organizationId)
    expect(enc.serviceProvider).toEqual({ reference: "Organization/16723" });
  });

  it("records a value-less Observation with dataAbsentReason when vitals are not fetched", () => {
    const reason = VITALS_NOT_FETCHED_REASONS[0];
    const b = buildClinicalBundle({
      ...SAMPLE_ASSESSMENT,
      vitalsNotFetched: true,
      vitalsNotFetchedReason: reason,
      vitals: {},
    });
    const obs = b.entry.map((e: any) => e.resource).filter((r: any) => r.resourceType === "Observation");
    // Exactly one Observation, with no value and a dataAbsentReason — no measured vitals.
    expect(obs).toHaveLength(1);
    expect(obs[0].valueQuantity).toBeUndefined();
    expect(obs[0].component).toBeUndefined();
    expect(obs[0].dataAbsentReason.coding[0].code).toBe(reason.code);
    expect(obs[0].category[0].coding[0].code).toBe("vital-signs");
  });

  it("attaches to an existing encounter (no new Encounter) when existingEncounterId is set", () => {
    const b = buildClinicalBundle({ ...SAMPLE_ASSESSMENT, existingEncounterId: "19834", vitals: {} });
    const types = b.entry.map((e: any) => e.resource.resourceType);
    expect(types).not.toContain("Encounter");
    // every clinical resource references the existing encounter by literal id
    const enc = b.entry.map((e: any) => e.resource).filter((r: any) => r.encounter);
    for (const r of enc) expect(r.encounter).toEqual({ reference: "Encounter/19834" });
  });

  it("builds a Laboratory DiagnosticReport (REF-40) from diagnostic title/conclusion", () => {
    const b = buildClinicalBundle({
      ...SAMPLE_ASSESSMENT,
      vitals: {},
      diagnostic: { title: "Urinalysis Results", conclusion: "Proteinuria 3+" },
    });
    const dr = b.entry.map((e: any) => e.resource).find((r: any) => r.resourceType === "DiagnosticReport");
    expect(dr).toBeTruthy();
    expect(dr.category[0].coding[0].code).toBe("LAB");
    expect(dr.conclusion).toBe("Proteinuria 3+");
    expect(dr.presentedForm[0].title).toBe("Urinalysis Results");
  });

  it("only emits resources for data that was entered", () => {
    const minimal: ClinicalAssessmentInput = {
      patientId: "1",
      practitionerId: "2",
      effectiveDateTime: "2026-06-24T10:30:00+08:00",
      vitals: { hr: 80 },
    };
    const b = buildClinicalBundle(minimal);
    const types = b.entry.map((e: any) => e.resource.resourceType).sort();
    // Encounter + one HR Observation only — no BP, Condition or Procedure
    expect(types).toEqual(["Encounter", "Observation"]);
  });
});
