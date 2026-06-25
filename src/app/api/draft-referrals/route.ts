import { NextRequest, NextResponse } from 'next/server';
import { fhirGet, FhirError } from '@/lib/fhir';

const refId = (ref?: string) => ref?.split('/').pop() || '';
const collect = (b: any) => (b?.entry || []).map((e: any) => e.resource).filter(Boolean);

// GET supports two modes:
//   ?practitionerRole=<id>  → Draft Referrals LIST: encounters with draft ServiceRequests
//   ?serviceRequest=<id>    → Draft Referral VIEW: one ServiceRequest + Patient + Encounter
export async function GET(request: NextRequest) {
  try {
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const practitionerRole = request.nextUrl.searchParams.get('practitionerRole');
    const serviceRequest = request.nextUrl.searchParams.get('serviceRequest');

    if (!practitionerRole && !serviceRequest) {
      return NextResponse.json({ error: 'practitionerRole or serviceRequest parameter is required' }, { status: 400 });
    }

    // ── VIEW a single draft ServiceRequest + clinical data ────────────
    if (serviceRequest) {
      const srBundle = await fhirGet(
        `ServiceRequest?_id=${serviceRequest}&_include=ServiceRequest:subject&_include=ServiceRequest:encounter`,
        baseUrl,
      );
      const all = collect(srBundle);
      const sr = all.find((r: any) => r.resourceType === 'ServiceRequest') || null;
      const patient = all.find((r: any) => r.resourceType === 'Patient') || null;
      const encounter = all.find((r: any) => r.resourceType === 'Encounter') || null;
      const encounterId = encounter?.id || sr?.encounter?.reference?.split('/').pop();

      if (encounterId) {
        const [obsBundle, condBundle, procBundle, drBundle] = await Promise.all([
          fhirGet(`Observation?encounter=Encounter/${encounterId}&_count=100`, baseUrl),
          fhirGet(`Condition?encounter=Encounter/${encounterId}&_count=50`, baseUrl),
          fhirGet(`Procedure?encounter=Encounter/${encounterId}&_count=50`, baseUrl),
          fhirGet(`DiagnosticReport?encounter=Encounter/${encounterId}&_count=50`, baseUrl),
        ]);
        return NextResponse.json({
          serviceRequest: sr,
          patient,
          encounter,
          observations: collect(obsBundle),
          conditions: collect(condBundle),
          procedures: collect(procBundle),
          diagnosticReports: collect(drBundle),
        });
      }

      return NextResponse.json({ serviceRequest: sr, patient, encounter });
    }

    // ── LIST: Encounters with draft ServiceRequest ──────────────────────
    // Uses Encounter _has reverse chaining so the response shape matches clinical-transfer.
    const bundle = await fhirGet(
      `Encounter?_has:ServiceRequest:encounter:requester=PractitionerRole/${practitionerRole}&_has:ServiceRequest:encounter:status=draft&_revinclude=ServiceRequest:encounter&_include=Encounter:subject&_sort=-date&_count=100`,
      baseUrl,
    );

    const all = collect(bundle);
    const patients = new Map<string, any>(
      all.filter((r: any) => r.resourceType === 'Patient').map((p: any) => [p.id, p]),
    );

    // Group draft ServiceRequests by encounter
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
