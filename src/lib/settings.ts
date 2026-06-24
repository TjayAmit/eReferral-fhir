export interface FhirServer {
  id: string;
  version: string;
  name: string;
  endpoint: string;
  capabilities: string;
  notes?: string;
  disabled?: boolean;
  /** Exact FHIR base URL if different from the endpoint display value. */
  baseUrl?: string;
}

export const DEFAULT_FHIR_SERVER_ID = "pheref";

export const FHIR_SERVERS: FhirServer[] = [
  {
    id: "pheref",
    version: "FHIR R4",
    name: "FHIRLab (HAPI FHIR) - PH eReferral",
    endpoint: "cdr.pheref.fhirlab.net",
    capabilities: "CRUD, transaction, validation",
  },
  {
    id: "phcore",
    version: "FHIR R4",
    name: "FHIRLab (HAPI FHIR) - PH Core",
    endpoint: "cdr.phcore.fhirlab.net",
    capabilities: "CRUD, transaction, validation",
  },
  {
    id: "ontoserver",
    version: "FHIR R4",
    name: "Ontoserver Terminology",
    endpoint: "ontoserver.csiro.au/ui/about",
    baseUrl: "https://ontoserver.csiro.au/fhir",
    capabilities: "$expand, $validate-code, $lookup",
  },
  {
    id: "ontoserver-shrimp",
    version: "FHIR R4",
    name: "Ontoserver with Shrimp Viewer",
    endpoint: "ontoserver.csiro.au/shrimp/",
    baseUrl: "https://ontoserver.csiro.au/fhir",
    capabilities: "Terminology browsing & visualization",
  },
  {
    id: "fhirportal",
    version: "FHIR R4",
    name: "FHIRPortal (HAPI FHIR)",
    endpoint: "To be updated",
    capabilities: "Back Up HAPI FHIR Server",
    notes: "Do not use unless instructed.",
    disabled: true,
  },
  {
    id: "fhirlab",
    version: "FHIR R4",
    name: "FHIRLab Legacy",
    endpoint: "cdr.fhirlab.net/fhir",
    capabilities: "CRUD, transaction, validation",
  },
];

export function getServerById(id: string | null): FhirServer | undefined {
  return FHIR_SERVERS.find((s) => s.id === id);
}

export function buildFhirBaseUrl(server: FhirServer | undefined): string {
  if (!server) return "";
  if (server.baseUrl) {
    return server.baseUrl.trim().replace(/\/+$/, "");
  }
  const raw = server.endpoint.trim().replace(/\/+$/, "");
  if (raw.endsWith("/fhir")) return "https://" + raw;
  return "https://" + raw + "/fhir";
}

export function getStoredServerId(): string {
  if (typeof window === "undefined") return DEFAULT_FHIR_SERVER_ID;
  return window.localStorage.getItem("fhir-server-id") || DEFAULT_FHIR_SERVER_ID;
}

export function setStoredServerId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("fhir-server-id", id);
}

export function getStoredFhirBaseUrl(): string {
  const id = getStoredServerId();
  const server = getServerById(id) || getServerById(DEFAULT_FHIR_SERVER_ID);
  return buildFhirBaseUrl(server);
}
