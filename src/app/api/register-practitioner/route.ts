import { NextRequest, NextResponse } from 'next/server';
import { submitTransaction, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    
    if (!body.givenName || !body.familyName) {
      return NextResponse.json(
        { error: 'Given name and family name are required' },
        { status: 400 }
      );
    }

    if (!body.organizationId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const prcLicense = body.prcLicense || `TEMP-${Date.now()}`;
    const roleId = `ROLE-${prcLicense}`;

    // Generate UUIDs for bundle references
    const practitionerUuid = `urn:uuid:${crypto.randomUUID()}`;
    const organizationUuid = `urn:uuid:${crypto.randomUUID()}`;
    const roleUuid = `urn:uuid:${crypto.randomUUID()}`;

    const bundle = {
      resourceType: "Bundle",
      type: "transaction",
      entry: [
        {
          fullUrl: practitionerUuid,
          request: {
            method: "PUT",
            url: `Practitioner?identifier=https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number|${prcLicense}`
          },
          resource: {
            resourceType: "Practitioner",
            identifier: [{
              system: "https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number",
              value: prcLicense,
            }],
            active: true,
            name: [{
              use: "official",
              family: body.familyName,
              given: [body.givenName],
              prefix: ["Dr."],
            }],
            telecom: [{
              system: "phone",
              value: "+63-917-111-2233",
              use: "work"
            }],
          }
        },
        {
          fullUrl: roleUuid,
          request: {
            method: "PUT",
            url: `PractitionerRole?identifier=https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id|${roleId}`
          },
          resource: {
            resourceType: "PractitionerRole",
            identifier: [{
              system: "https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id",
              value: roleId,
            }],
            active: true,
            practitioner: {
              reference: practitionerUuid
            },
            organization: {
              reference: `Organization/${body.organizationId}`
            },
            code: [{
              coding: [{
                system: "https://www.fhir.doh.gov.ph/pheref/CodeSystem/practitioner-role",
                code: "physician",
                display: "Physician"
              }]
            }],
          }
        }
      ]
    };

    const result = await submitTransaction(bundle, baseUrl);
    
    // Extract practitioner ID from response
    const practitionerEntry = result.entry?.find((e: any) => 
      e.response?.location?.includes("Practitioner")
    );
    const practitionerId = practitionerEntry?.response?.location?.split("/")[1];

    return NextResponse.json({
      success: true,
      practitionerId,
      bundle: result
    }, { status: 200 });
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json(
        { error: error.message, outcome: error.outcome },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
