import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, fhirPut, fhirDelete, fhirConditionalPut, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    
    if (!body.resourceType || body.resourceType !== 'Practitioner') {
      return NextResponse.json(
        { error: 'Resource must be a Practitioner' },
        { status: 400 }
      );
    }

    // Check if PRC license is provided for conditional update
    const prcIdentifier = body.identifier?.find(
      (id: any) => id.system === 'https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number'
    );
    
    if (prcIdentifier && prcIdentifier.value) {
      // Use conditional PUT with PRC license identifier
      const result = await fhirConditionalPut(
        'Practitioner',
        'https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number',
        prcIdentifier.value,
        body,
        baseUrl
      );
      return NextResponse.json(result, { status: result.id ? 200 : 201 });
    }

    // Regular POST if no PRC license
    const result = await fhirPost('Practitioner', body, baseUrl);
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
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (id) {
      const result = await fhirGet(`Practitioner/${id}`, baseUrl);
      return NextResponse.json(result);
    }
    
    const result = await fhirGet('Practitioner?_count=100', baseUrl);
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

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: 'Practitioner ID is required for update' }, { status: 400 });
    }
    const result = await fhirPut('Practitioner', id, body, baseUrl);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json(
        { error: error.message, outcome: error.outcome },
        { status: error.status }
      );
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
      return NextResponse.json({ error: 'Practitioner ID is required for deletion' }, { status: 400 });
    }
    const result = await fhirDelete('Practitioner', id, baseUrl);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FhirError) {
      return NextResponse.json(
        { error: error.message, outcome: error.outcome },
        { status: error.status }
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
