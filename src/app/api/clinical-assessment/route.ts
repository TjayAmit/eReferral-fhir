import { NextRequest, NextResponse } from 'next/server';
import { submitTransaction, fhirGet, FhirError } from '@/lib/fhir';

// POST: submit the doctor's assessment as one transaction Bundle (Encounter +
// Observations + Conditions + Procedure), created atomically.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;

    if (body?.resourceType !== 'Bundle' || body?.type !== 'transaction') {
      return NextResponse.json({ error: 'Body must be a transaction Bundle' }, { status: 400 });
    }

    const result = await submitTransaction(body, baseUrl);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const refId = (ref?: string) => ref?.split('/').pop() || '';
const collect = (b: any) => (b?.entry || []).map((e: any) => e.resource).filter(Boolean);

// GET supports three modes:
//   ?serviceProvider=<orgId>  → Clinical Update LIST: triage encounters originating
//                               at our org (we set serviceProvider = hospitalization.origin),
//                               each paired with its Patient. Excludes patients with
//                               ServiceRequest or ReferralRequest (those go to Clinical Transfer).
//   ?encounter=<encId>        → Clinical Update VIEW: one Encounter + its Patient +
//                               Observations (+ Conditions/Procedures) for display/update.
//   ?patient=<patId>          → all clinical resources recorded for a patient (latest first).
export async function GET(request: NextRequest) {
  try {
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const sp = request.nextUrl.searchParams.get('serviceProvider');
    const encounter = request.nextUrl.searchParams.get('encounter');
    const patient = request.nextUrl.searchParams.get('patient');

    // ── LIST by originating organization ────────────────────────────────
    if (sp) {
      // hospitalization.origin has no FHIR search param; we set serviceProvider to the
      // same org at triage, so service-provider is the searchable equivalent of origin.
      // Use _revinclude to fetch ServiceRequests directly with the Encounter.
      const bundle = await fhirGet(
        `Encounter?service-provider=Organization/${sp}&_include=Encounter:subject&_revinclude=ServiceRequest:encounter&_sort=-date&_count=100`,
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

      const encounters = all
        .filter((r: any) => r.resourceType === 'Encounter')
        .filter((enc: any) => {
          // Clinical Profile: only show encounters WITHOUT ServiceRequests
          return !serviceRequestsByEncounter.has(enc.id);
        })
        .map((enc: any) => ({ encounter: enc, patient: patients.get(refId(enc.subject?.reference)) || null }));
      return NextResponse.json({ encounters });
    }

    // ── VIEW a single encounter ─────────────────────────────────────────
    if (encounter) {
      const [encBundle, condBundle, procBundle, drBundle, taskBundle] = await Promise.all([
        fhirGet(`Encounter?_id=${encounter}&_include=Encounter:subject&_revinclude=Observation:encounter`, baseUrl),
        fhirGet(`Condition?encounter=Encounter/${encounter}&_count=50`, baseUrl),
        fhirGet(`Procedure?encounter=Encounter/${encounter}&_count=50`, baseUrl),
        fhirGet(`DiagnosticReport?encounter=Encounter/${encounter}&_count=50`, baseUrl),
        fhirGet(`Task?encounter=Encounter/${encounter}&_count=50`, baseUrl),
      ]);
      const all = collect(encBundle);
      return NextResponse.json({
        encounter: all.find((r: any) => r.resourceType === 'Encounter') || null,
        patient: all.find((r: any) => r.resourceType === 'Patient') || null,
        observations: all.filter((r: any) => r.resourceType === 'Observation'),
        conditions: collect(condBundle),
        procedures: collect(procBundle),
        diagnosticReports: collect(drBundle),
        tasks: collect(taskBundle),
      });
    }

    // ── all clinical resources for a patient ────────────────────────────
    if (patient) {
      const [encounters, observations, conditions, procedures] = await Promise.all([
        fhirGet(`Encounter?subject=Patient/${patient}&_sort=-date&_count=50`, baseUrl),
        fhirGet(`Observation?subject=Patient/${patient}&_sort=-date&_count=100`, baseUrl),
        fhirGet(`Condition?subject=Patient/${patient}&_sort=-recorded-date&_count=100`, baseUrl),
        fhirGet(`Procedure?subject=Patient/${patient}&_sort=-date&_count=50`, baseUrl),
      ]);
      return NextResponse.json({
        encounters: collect(encounters),
        observations: collect(observations),
        conditions: collect(conditions),
        procedures: collect(procedures),
      });
    }

    return NextResponse.json({ error: 'serviceProvider, encounter or patient is required' }, { status: 400 });
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
