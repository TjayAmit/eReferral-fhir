import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, fhirPut, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;

    if (!body.resourceType || body.resourceType !== 'Encounter') {
      return NextResponse.json({ error: 'Resource must be an Encounter' }, { status: 400 });
    }

    // Every Encounter must reference a patient (participant is optional — e.g. an
    // inpatient admission opened from the ER may not yet have an attending assigned).
    if (!body.subject) {
      return NextResponse.json({ error: 'Encounter must reference a patient (subject)' }, { status: 400 });
    }

    const result = await fhirPost('Encounter', body, baseUrl);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: update an Encounter by id (status changes, disposition finalization, …).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: 'Encounter ID is required for update' }, { status: 400 });
    }
    const result = await fhirPut('Encounter', id, body, baseUrl);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const patient = searchParams.get('patient');
    
    let query = 'Encounter?_count=100';
    if (patient) {
      query += `&subject=${patient}`;
    }
    
    const result = await fhirGet(query);
    return NextResponse.json(result);
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
