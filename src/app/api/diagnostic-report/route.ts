import { NextRequest, NextResponse } from "next/server";
import { fhirPost, fhirGet } from "@/lib/fhir";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { encounterId, patientId, fileName, fileData, fileType, title, conclusion, code, codeSystem, codeDisplay } = body;

    if (!encounterId || !patientId || !fileData) {
      return NextResponse.json({ error: "Missing required fields: encounterId, patientId, or fileData" }, { status: 400 });
    }

    // Generate a unique ID for the DiagnosticReport
    const reportId = `DR-${Date.now()}`;

    // Use data URL format to store base64 data with contentType embedded
    // This satisfies the att-1 constraint (if data exists, contentType must exist)
    const mimeType = fileType === "application/pdf" ? "application/pdf" :
                     fileType === "image/png" ? "image/png" :
                     fileType === "text/plain" ? "text/plain" :
                     "application/pdf";

    const dataUrl = `data:${mimeType};base64,${fileData}`;

    const diagnosticReport = {
      resourceType: "DiagnosticReport",
      id: reportId,
      status: "final",
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><p class="res-header-id"><b>Generated Narrative: DiagnosticReport ${reportId}</b></p><a name="${reportId}"> </a><h2><span title="Codes:{http://loinc.org ${code || "24356-8"}}">${codeDisplay || "Urinalysis complete panel - Urine"}</span> </h2><table class="grid"><tr><td>Subject</td><td>Patient/${patientId}</td></tr><tr><td>Encounter</td><td>Encounter/${encounterId}</td></tr></table><p><b>Report Details</b></p><p>${conclusion || "No conclusion provided"}</p></div>`
      },
      code: {
        coding: [
          {
            system: codeSystem || "http://loinc.org",
            code: code || "24356-8",
            display: codeDisplay || "Urinalysis complete panel - Urine"
          }
        ]
      },
      subject: {
        reference: `Patient/${patientId}`
      },
      encounter: encounterId ? {
        reference: `Encounter/${encounterId}`
      } : undefined,
      conclusion: conclusion || "",
      presentedForm: [
        {
          title: title || fileName || "Laboratory Results",
          url: dataUrl // Use data URL format with embedded contentType
        }
      ]
    };

    const created = await fhirPost("DiagnosticReport", diagnosticReport);
    return NextResponse.json(created);
  } catch (error: any) {
    console.error("Error creating DiagnosticReport:", error);
    return NextResponse.json({ error: error.message || "Failed to create DiagnosticReport" }, { status: 500 });
  }
}
