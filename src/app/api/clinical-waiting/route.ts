import { NextRequest, NextResponse } from 'next/server';
import { fhirGet, FhirError } from '@/lib/fhir';

const refId = (ref?: string) => ref?.split('/').pop() || '';
const collect = (b: any) => (b?.entry || []).map((e: any) => e.resource).filter(Boolean);

// GET: Fetch encounters with ServiceRequest from the organization
// Query param: ?organization=<orgId>
export async function GET(request: NextRequest) {
  try {
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const organization = request.nextUrl.searchParams.get('organization');

    if (!organization) {
      return NextResponse.json({ error: 'organization parameter is required' }, { status: 400 });
    }

    // Fetch Encounters with service-provider matching the organization
    // Use _revinclude to fetch ServiceRequests directly with the Encounter
    const bundle = await fhirGet(
      `Encounter?service-provider=Organization/${organization}&_include=Encounter:subject&_revinclude=ServiceRequest:encounter&_sort=-date&_count=100`,
      baseUrl,
    );

    const all = collect(bundle);
    const patients = new Map<string, any>(
      all.filter((r: any) => r.resourceType === 'Patient').map((p: any) => [p.id, p]),
    );

    // Group ServiceRequests by encounter
    const serviceRequestsByEncounter = new Map<string, any[]>();
    all.forEach((r: any) => {
      if (r.resourceType === 'ServiceRequest' && r.encounter?.reference) {
        const encId = refId(r.encounter.reference);
        if (!serviceRequestsByEncounter.has(encId)) {
          serviceRequestsByEncounter.set(encId, []);
        }
        serviceRequestsByEncounter.get(encId)!.push(r);
      }
    });

    // Clinical Waiting: only show encounters WITH ServiceRequests
    const encounters = all
      .filter((r: any) => r.resourceType === 'Encounter')
      .filter((enc: any) => {
        return serviceRequestsByEncounter.has(enc.id);
      })
      .map((enc: any) => ({
        encounter: enc,
        patient: patients.get(refId(enc.subject?.reference)) || null,
        serviceRequests: (serviceRequestsByEncounter.get(enc.id) || []).sort((a, b) =>
          new Date(b.authoredOn || 0).getTime() - new Date(a.authoredOn || 0).getTime()
        ),
      }));

    return NextResponse.json({ encounters });
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
