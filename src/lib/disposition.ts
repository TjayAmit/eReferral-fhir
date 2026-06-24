// ER disposition: transition an Encounter from the Clinical Profile stage to a
// final state. FHIR Encounter.status has no "completed"/"transferred"/"admitted"
// codes, so finalization uses status "finished" plus hospitalization.dischargeDisposition
// (and, for Admit, a brand-new inpatient Encounter for the same patient).
//
// Encounter updates are done as STANDALONE resource PUTs (not inside the clinical
// transaction Bundle) — putting the encounter in the same bundle that also
// references it breaks FHIR bundle reference-resolution on strict servers.

const V3_ACTCODE = "http://terminology.hl7.org/CodeSystem/v3-ActCode";
const DISCHARGE_DISPOSITION = "http://terminology.hl7.org/CodeSystem/discharge-disposition";
const SNOMED = "http://snomed.info/sct";

export type Disposition = "discharge" | "transfer" | "admit";

export const DISPOSITIONS: { value: Disposition; label: string; description: string }[] = [
  { value: "discharge", label: "Discharge", description: "Close the visit — patient sent home." },
  { value: "transfer", label: "Transfer", description: "Finish the visit and mark transferred to another facility." },
  { value: "admit", label: "Admit", description: "Finish the ER visit and open a new inpatient encounter." },
];

/**
 * Clean an Encounter before re-PUTting it: drop the (stale) narrative and remove
 * the bad triage reasonCode (SNOMED 73770003 is not valid for Encounter.reasonCode),
 * so the update doesn't trip server validation. Returns a deep copy.
 */
export function sanitizeEncounter(encounter: any) {
  const e = JSON.parse(JSON.stringify(encounter));
  delete e.text;
  // Remove reasonCode entirely - 73770003 is not valid for Encounter.reasonCode
  // (it belongs in ServiceRequest.category from referral-category ValueSet)
  delete e.reasonCode;
  // Also remove note if present (not allowed on Encounter)
  delete e.note;
  return e;
}

/** Encounter resource with a new status (sanitized), preserving id for a PUT. */
export function withEncounterStatus(encounter: any, status: string) {
  return { ...sanitizeEncounter(encounter), status };
}

/**
 * Finalize per the doctor's disposition.
 *  - discharge → finished + dischargeDisposition "home".
 *  - transfer  → finished + dischargeDisposition "other-hcf" (transferred).
 *  - admit     → finished + a separate inpatient Encounter (class IMP) for the same patient.
 * Returns the updated ER encounter, plus (for admit) the inpatient encounter to create.
 */
export function applyDisposition(
  encounter: any,
  patientId: string,
  disposition: Disposition,
  nowIso: string = new Date().toISOString(),
  note?: string,
): { er: any; inpatient?: any } {
  const base = sanitizeEncounter(encounter);
  const period = { ...(base.period || {}), end: nowIso };
  const hosp = (extra: Record<string, any>) => ({ ...(base.hospitalization || {}), ...extra });

  if (disposition === "discharge") {
    return {
      er: {
        ...base,
        status: "finished",
        period,
        hospitalization: hosp({
          dischargeDisposition: { coding: [{ system: DISCHARGE_DISPOSITION, code: "home", display: "Home" }] },
        }),
      },
    };
  }

  if (disposition === "transfer") {
    const transferText = note
      ? `Transferred to another facility — ${note}`
      : "Transferred to another facility";
    const er: any = {
      ...base,
      status: "in-progress", // Keep in-progress until referral is accepted
      period,
      hospitalization: hosp({
        dischargeDisposition: {
          coding: [{ system: DISCHARGE_DISPOSITION, code: "other-hcf", display: "Other healthcare facility" }],
          text: transferText,
        },
      }),
    };
    // Note is not allowed on Encounter, so we put it in dischargeDisposition.text instead
    return { er };
  }

  // admit
  const er = {
    ...base,
    status: "finished",
    period,
    hospitalization: hosp({
      dischargeDisposition: { coding: [{ system: DISCHARGE_DISPOSITION, code: "oth", display: "Other" }], text: "Admitted as inpatient" },
    }),
  };
  const inpatient = {
    resourceType: "Encounter",
    status: "in-progress",
    class: { system: V3_ACTCODE, code: "IMP", display: "inpatient encounter" },
    type: [{ coding: [{ system: SNOMED, code: "32485007", display: "Hospital admission" }] }],
    subject: { reference: `Patient/${patientId}` },
    partOf: { reference: `Encounter/${encounter.id}` }, // links the inpatient visit to the ER visit
    period: { start: nowIso },
    ...(base.serviceProvider ? { serviceProvider: base.serviceProvider } : {}),
  };
  return { er, inpatient };
}
