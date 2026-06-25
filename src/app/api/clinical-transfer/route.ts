import { NextRequest, NextResponse } from 'next/server';
import { fhirGet, FhirError } from '@/lib/fhir';

const refId = (ref?: string) => ref?.split('/').pop() || '';
const collect = (b: any) => (b?.entry || []).map((e: any) => e.resource).filter(Boolean);

// GET supports two modes:
//   ?organization=<orgId>  → Clinical Transfer LIST: encounters with ServiceRequests
//   ?encounter=<encId>     → Clinical Transfer VIEW: one Encounter + clinical data + ServiceRequests
export async function GET(request: NextRequest) {
  try {
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const organization = request.nextUrl.searchParams.get('organization');
    const encounter = request.nextUrl.searchParams.get('encounter');

    if (!organization && !encounter) {
      return NextResponse.json({ error: 'organization or encounter parameter is required' }, { status: 400 });
    }

    // ── VIEW a single encounter (detail page) ────────────────────────────
    if (encounter) {
      const [encBundle, condBundle, procBundle, drBundle, srBundle] = await Promise.all([
        fhirGet(`Encounter?_id=${encounter}&_include=Encounter:subject&_revinclude=Observation:encounter`, baseUrl),
        fhirGet(`Condition?encounter=Encounter/${encounter}&_count=50`, baseUrl),
        fhirGet(`Procedure?encounter=Encounter/${encounter}&_count=50`, baseUrl),
        fhirGet(`DiagnosticReport?encounter=Encounter/${encounter}&_count=50`, baseUrl),
        fhirGet(`ServiceRequest?encounter=Encounter/${encounter}&_count=50`, baseUrl),
      ]);
      const all = collect(encBundle);
      return NextResponse.json({
        encounter: all.find((r: any) => r.resourceType === 'Encounter') || null,
        patient: all.find((r: any) => r.resourceType === 'Patient') || null,
        observations: all.filter((r: any) => r.resourceType === 'Observation'),
        conditions: collect(condBundle),
        procedures: collect(procBundle),
        diagnosticReports: collect(drBundle),
        serviceRequests: collect(srBundle),
      });
    }

    // Fetch Encounters with service-provider matching the organization
    const bundle = await fhirGet(
      `Encounter?service-provider=Organization/${organization}&_include=Encounter:subject&_revinclude=ServiceRequest:encounter&_sort=-date&_count=100`,
      baseUrl,
    );

    const all = collect(bundle);
    const patients = new Map<string, any>(
      all.filter((r: any) => r.resourceType === 'Patient').map((p: any) => [p.id, p]),
    );

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

    const encounters = all
      .filter((r: any) => r.resourceType === 'Encounter')
      .filter((enc: any) => serviceRequestsByEncounter.has(enc.id))
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
