import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, FhirError } from '@/lib/fhir';

const collect = (b: any) => (b?.entry || []).map((e: any) => e.resource).filter(Boolean);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;

    if (!body.resourceType || body.resourceType !== 'ServiceRequest') {
      return NextResponse.json({ error: 'Resource must be a ServiceRequest' }, { status: 400 });
    }

    if (!body.subject) {
      return NextResponse.json({ error: 'ServiceRequest must reference a patient (subject)' }, { status: 400 });
    }

    const result = await fhirPost('ServiceRequest', body, baseUrl);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const encounter = request.nextUrl.searchParams.get('encounter');

    if (!encounter) {
      return NextResponse.json({ error: 'encounter parameter is required' }, { status: 400 });
    }

    const bundle = await fhirGet(`ServiceRequest?encounter=${encounter}&_count=50`, baseUrl);
    const serviceRequests = collect(bundle);
    return NextResponse.json({ serviceRequests });
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
