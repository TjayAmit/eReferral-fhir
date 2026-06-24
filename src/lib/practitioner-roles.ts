// Practitioner role codes for PractitionerRole.code.
//
// The PH eReferral IG defines a local CodeSystem for practitioner roles:
//   https://www.fhir.doh.gov.ph/pheref/CodeSystem/practitioner-role
// The live FHIR server example uses code "physician" with display "Physician".
// We expose the authoritative list from the server for selection, falling back
// to a hard-coded list when the server cannot be reached.

const SNOMED = "http://snomed.info/sct";
const PSOC = "https://fhir.doh.gov.ph/phcore/CodeSystem/PSOC";
const PHCW = "https://fhir.doh.gov.ph/phcore/CodeSystem/PHCW";

export const PH_EREFERRAL_ROLE_CS = "https://www.fhir.doh.gov.ph/pheref/CodeSystem/practitioner-role";

export interface RoleOption {
  code: string;
  display: string;
  system: string;
}

// Fallback codes when the server CodeSystem is unavailable.
const FALLBACK_ROLES: RoleOption[] = [
  { code: "physician", display: "Physician", system: PH_EREFERRAL_ROLE_CS },
  { code: "158965000", display: "Doctor",                 system: SNOMED },
  { code: "265937000", display: "Nurse",                  system: SNOMED },
  { code: "309453006", display: "Midwife",                system: SNOMED },
  { code: "46255001",  display: "Pharmacist",             system: SNOMED },
  { code: "386629007", display: "Medical Technologist",   system: SNOMED },
  { code: "159282002", display: "Laboratory Aide",        system: SNOMED },
  { code: "106289002", display: "Dentist",                system: SNOMED },
  { code: "4162009",   display: "Dental Aide",            system: SNOMED },
  { code: "28229004",  display: "Optometrist",            system: SNOMED },
  { code: "3253",      display: "Barangay Health Worker", system: PSOC },
  { code: "PCW",       display: "Primary Care Worker",    system: PHCW },
];

export const ROLE_CODES = FALLBACK_ROLES as Readonly<RoleOption[]>;

export type RoleCode = string;

/** Default selection — physician (PH eReferral CodeSystem). */
export const DEFAULT_ROLE_CODE: RoleCode = "physician";

export const DEFAULT_ROLE_OPTION: RoleOption = { code: "physician", display: "Physician", system: PH_EREFERRAL_ROLE_CS };

/** Full CodeableConcept.coding for a role option, falling back to the default. */
export function roleCoding(option: RoleOption | string): { system: string; code: string; display: string } {
  if (typeof option === "string") {
    const r = FALLBACK_ROLES.find((x) => x.code === option) ?? DEFAULT_ROLE_OPTION;
    return { system: r.system, code: r.code, display: r.display };
  }
  return { system: option.system, code: option.code, display: option.display };
}

/** Human-readable label for a role code (for table cells, etc.). */
export function roleDisplay(code: string): string {
  return FALLBACK_ROLES.find((r) => r.code === code)?.display ?? code;
}

/** Fetch the PH eReferral practitioner-role CodeSystem from the FHIR server. */
export async function fetchRoleCodes(baseUrl: string): Promise<RoleOption[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/CodeSystem?url=${encodeURIComponent(PH_EREFERRAL_ROLE_CS)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/fhir+json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bundle = await res.json();
    const cs = (bundle.entry || [])
      .map((e: any) => e.resource)
      .find((r: any) => r.resourceType === "CodeSystem");
    if (cs?.concept?.length) {
      return cs.concept.map((c: any) => ({
        code: c.code,
        display: c.display || c.code,
        system: PH_EREFERRAL_ROLE_CS,
      }));
    }
  } catch (e) {
    console.error("Failed to load practitioner-role CodeSystem from server:", e);
  }
  return [...FALLBACK_ROLES];
}
