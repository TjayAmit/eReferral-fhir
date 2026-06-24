// Thin FHIR REST client. The open FHIRLab sandbox needs no auth and allows CORS,
// so calls go straight from the browser to the server — no backend/proxy/DB.

export const FHIR_BASE =
  process.env.NEXT_PUBLIC_FHIR_BASE_URL?.replace(/\/$/, "") ||
  "https://cdr.pheref.fhirlab.net/fhir";

const FHIR_JSON = "application/fhir+json";

export class FhirError extends Error {
  status: number;
  outcome: any;
  constructor(status: number, message: string, outcome?: any) {
    super(message);
    this.name = "FhirError";
    this.status = status;
    this.outcome = outcome;
  }
}

async function parse(res: Response) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const diag =
      body?.issue?.map((i: any) => i.diagnostics || i.details?.text).filter(Boolean).join(" · ") ||
      res.statusText;
    throw new FhirError(res.status, `HTTP ${res.status}: ${diag}`, body);
  }
  return body;
}

/** Use Case 1 — POST the eReferral transaction Bundle to the server root. */
export async function submitTransaction(bundle: any) {
  const res = await fetch(FHIR_BASE, {
    method: "POST",
    headers: { "Content-Type": FHIR_JSON, Accept: FHIR_JSON },
    body: JSON.stringify(bundle),
  });
  return parse(res);
}

/** Generic search / read (path is relative to the base, e.g. "Task?status=requested"). */
export async function fhirGet(path: string) {
  const res = await fetch(`${FHIR_BASE}/${path.replace(/^\//, "")}`, {
    headers: { Accept: FHIR_JSON },
    cache: "no-store",
  });
  return parse(res);
}

/** Use Case 2 — retrieve the whole referral as one Bundle via the patient compartment. */
export async function patientEverything(patientId: string) {
  return fhirGet(`Patient/${patientId}/$everything?_count=300`);
}

/** Use Case 2 — discover incoming referrals (Task focus = ServiceRequest, for = Patient). */
export async function listIncomingTasks() {
  return fhirGet(
    "Task?status=requested&_include=Task:focus&_include=Task:patient&_sort=-authored-on&_count=50"
  );
}

/** Generic JSON-Patch for any FHIR resource. */
export async function fhirPatch(
  resourceType: string,
  id: string,
  ops: any[],
  headers: Record<string, string> = { "Content-Type": "application/json-patch+json", Accept: FHIR_JSON }
) {
  const res = await fetch(`${FHIR_BASE}/${resourceType}/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(ops),
  });
  return parse(res);
}

/** Use Case 2 — update an action point on the Task via JSON-Patch. */
export async function patchTask(taskId: string, ops: any[]) {
  return fhirPatch("Task", taskId, ops);
}

/** Create a FHIR resource (POST to resource type endpoint). */
export async function fhirPost(resourceType: string, resource: any) {
  const res = await fetch(`${FHIR_BASE}/${resourceType}`, {
    method: "POST",
    headers: { "Content-Type": FHIR_JSON, Accept: FHIR_JSON },
    body: JSON.stringify(resource),
  });
  return parse(res);
}

/** Update a FHIR resource (PUT to resource instance endpoint). */
export async function fhirPut(resourceType: string, id: string, resource: any) {
  const res = await fetch(`${FHIR_BASE}/${resourceType}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": FHIR_JSON, Accept: FHIR_JSON },
    body: JSON.stringify(resource),
  });
  return parse(res);
}

/** Delete a FHIR resource. */
export async function fhirDelete(resourceType: string, id: string) {
  const res = await fetch(`${FHIR_BASE}/${resourceType}/${id}`, {
    method: "DELETE",
    headers: { Accept: FHIR_JSON },
  });
  return parse(res);
}

/** Conditional update/create FHIR resource using identifier. */
export async function fhirConditionalPut(resourceType: string, identifierSystem: string, identifierValue: string, resource: any) {
  const res = await fetch(`${FHIR_BASE}/${resourceType}?identifier=${identifierSystem}|${identifierValue}`, {
    method: "PUT",
    headers: { "Content-Type": FHIR_JSON, Accept: FHIR_JSON },
    body: JSON.stringify(resource),
  });
  return parse(res);
}
