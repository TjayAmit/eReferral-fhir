import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.resourceType || body.resourceType !== 'Encounter') {
      return NextResponse.json(
        { error: 'Resource must be an Encounter' },
        { status: 400 }
      );
    }

    // Validate required references
    if (!body.subject || !body.participant) {
      return NextResponse.json(
        { error: 'Encounter must reference patient (subject) and practitioner (participant)' },
        { status: 400 }
      );
    }

    const result = await fhirPost('Encounter', body);
    return NextResponse.json(result, { status: 201 });
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
