import type { FhirResource } from "fhir/r4";

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}

export function patientName(p?: FhirResource | null): string {
  if (!p || p.resourceType !== "Patient") return "Unknown patient";
  const n = (p.name || [])[0];
  if (!n) return "Unnamed · " + (p.id ?? "");
  return [(n.given || []).join(" "), n.family].filter(Boolean).join(" ") || n.text || "Unnamed";
}

export function patientId(p?: FhirResource | null): string {
  if (!p || p.resourceType !== "Patient") return "";
  const ids = p.identifier || [];
  const ph = ids.find((i) => (i.system || "").includes("philhealth"));
  return ph ? "PhilHealth " + ph.value : ids[0] ? ids[0].value ?? "" : p.id ?? "";
}

export function idValue(p: FhirResource | undefined, sys: string): string {
  if (!p || p.resourceType !== "Patient") return "";
  const i = (p.identifier || []).find((x) => (x.system || "").includes(sys));
  return i ? i.value ?? "" : "";
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0] || "")[0] || "") + ((parts[parts.length - 1] || "")[0] || "");
}

export function ageFrom(bd?: string): string {
  if (!bd) return "";
  const b = new Date(bd);
  if (isNaN(b.getTime())) return "";
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a + " yrs";
}

export function addressText(p?: FhirResource | null): string {
  if (!p || p.resourceType !== "Patient") return "";
  const a = (p.address || [])[0];
  if (!a) return "";
  return [(a.line || []).join(", "), a.city, a.postalCode, a.country].filter(Boolean).join(", ");
}

export function ccText(cc?: { text?: string; coding?: Array<{ system?: string; code?: string; display?: string }> } | null): string {
  if (!cc) return "—";
  return cc.text || (cc.coding && cc.coding[0] && (cc.coding[0].display || cc.coding[0].code)) || "—";
}

export function clinStatus(c: FhirResource | undefined): string {
  if (!c || c.resourceType !== "Condition") return "";
  const x = (c.clinicalStatus?.coding || [])[0];
  return x ? x.code || "" : "";
}

export function verStatus(c: FhirResource | undefined): string {
  if (!c || c.resourceType !== "Condition") return "";
  const x = (c.verificationStatus?.coding || [])[0];
  return x ? x.code || "" : "";
}

export function severityBand(c: FhirResource | undefined): string {
  if (!c || c.resourceType !== "Condition") return "";
  const code = ((c.severity?.coding || [])[0] || {}).code;
  if (code === "24484000") return "severe";
  if (code === "6736007") return "moderate";
  if (code === "255604002") return "mild";
  return "";
}

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleString("en-PH", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function facilityCode(enc: FhirResource | undefined): string {
  if (!enc || enc.resourceType !== "Encounter") return "";
  const sp = enc.serviceProvider?.identifier;
  return sp ? sp.value || "" : "";
}

export function practName(p: FhirResource | undefined): string {
  if (!p || p.resourceType !== "Practitioner") return "Practitioner";
  const n = (p.name || [])[0];
  if (!n) return "Practitioner";
  return [(n.prefix || []).join(" "), (n.given || []).join(" "), n.family, (n.suffix || []).join(" ")].filter(Boolean).join(" ");
}

export function obsValue(o: FhirResource | undefined): string {
  if (!o || o.resourceType !== "Observation") return "—";
  if (o.valueQuantity) return `${o.valueQuantity.value || ""} ${o.valueQuantity.unit || o.valueQuantity.code || ""}`.trim();
  if (o.valueCodeableConcept) return ccText(o.valueCodeableConcept);
  if (o.valueString) return o.valueString;
  if (o.component) {
    return o.component
      .map((c) => {
        const v = c.valueQuantity;
        return `${ccText(c.code)}: ${v ? v.value + " " + (v.unit || "") : "—"}`;
      })
      .join(" · ");
  }
  return "—";
}

export function obsCategory(o: FhirResource | undefined): string {
  if (!o || o.resourceType !== "Observation") return "—";
  const c = (o.category?.[0]?.coding || [])[0];
  return c ? c.display || c.code || "—" : "—";
}

export function reasonKey(cond: FhirResource | undefined): string {
  if (!cond || cond.resourceType !== "Condition" || !cond.code) return "Unspecified";
  const c = (cond.code.coding || []).find((x) => (x.system || "").includes("snomed")) || (cond.code.coding || [])[0];
  return c ? c.display || c.code || "" : cond.code.text || "Unspecified";
}

export function resSummary(r: FhirResource): { t: string; m: (string | undefined)[] } {
  switch (r.resourceType) {
    case "Patient":
      return { t: patientName(r), m: [r.gender, r.birthDate, patientId(r)] };
    case "Encounter": {
      const t0 = (r.type || [])[0];
      const typeText = ccText(t0) !== "—" ? ccText(t0) : r.class?.display || r.class?.code || "";
      return {
        t: "Encounter — " + typeText,
        m: [
          "status: " + (r.status || "—"),
          r.class?.display || r.class?.code,
          r.period ? [fmtDate(r.period.start), r.period.end ? fmtDate(r.period.end) : ""].filter(Boolean).join(" → ") : "",
        ],
      };
    }
    case "Condition":
      return { t: ccText(r.code), m: ["clinical: " + (clinStatus(r) || "—"), "verify: " + (verStatus(r) || "—"), fmtDate(r.recordedDate || r.onsetDateTime)] };
    case "Observation":
      return { t: ccText(r.code), m: ["status: " + (r.status || "—"), obsValue(r), fmtDate(r.effectiveDateTime)] };
    case "Procedure":
      return { t: ccText(r.code), m: ["status: " + (r.status || "—"), fmtDate(r.performedDateTime)] };
    case "DiagnosticReport":
      return { t: ccText(r.code), m: ["status: " + (r.status || "—"), fmtDate(r.effectiveDateTime)] };
    case "Practitioner":
      return { t: practName(r), m: [r.qualification && r.qualification[0] ? ccText(r.qualification[0].code) : ""] };
    case "PractitionerRole":
      return { t: "Practitioner role", m: [ccText((r.specialty || [])[0])] };
    case "Organization":
      return { t: r.name || "Organization", m: [r.identifier && r.identifier[0] ? "NHFR " + r.identifier[0].value : ""] };
    default:
      return { t: r.resourceType, m: [r.id] };
  }
}
