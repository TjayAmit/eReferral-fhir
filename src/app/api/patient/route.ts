import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, fhirPut, fhirDelete, fhirConditionalPut, FhirError } from '@/lib/fhir';

const PHILHEALTH_SYSTEM = 'http://philhealth.gov.ph/fhir/Identifier/philhealth-id';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;

    if (!body.resourceType || body.resourceType !== 'Patient') {
      return NextResponse.json({ error: 'Resource must be a Patient' }, { status: 400 });
    }

    if (!body.identifier || !Array.isArray(body.identifier) || body.identifier.length === 0) {
      return NextResponse.json(
        { error: 'Patient must have at least one identifier (PhilHealth or PhilSys)' },
        { status: 400 }
      );
    }

    // If the body has an ID, use regular PUT to update that specific patient
    if (body.id) {
      const result = await fhirPut('Patient', body.id, body, baseUrl);
      return NextResponse.json(result, { status: 200 });
    }

    // Otherwise, create a new patient with POST
    const result = await fhirPost('Patient', body, baseUrl);
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
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const identifier = searchParams.get('identifier');

    if (id) {
      const result = await fhirGet(`Patient/${id}`, baseUrl);
      return NextResponse.json(result);
    }

    // Latest registrations first so the triage list surfaces new patients on top.
    let query = 'Patient?_count=100&_sort=-_lastUpdated';
    if (identifier) {
      // Search by PhilHealth identifier
      // Format: Patient?identifier=http://philhealth.gov.ph/fhir/Identifier/philhealth-id|{philhealthId}
      query += `&identifier=${PHILHEALTH_SYSTEM}|${identifier}`;
    }

    const result = await fhirGet(query, baseUrl);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: 'Patient ID is required for update' }, { status: 400 });
    }
    const result = await fhirPut('Patient', id, body, baseUrl);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Patient ID is required for deletion' }, { status: 400 });
    }
    const result = await fhirDelete('Patient', id, baseUrl);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
