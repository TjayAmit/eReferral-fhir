import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, fhirPut, fhirDelete, fhirConditionalPut, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const baseUrl = request.headers.get('X-FHIR-Base-Url') || undefined;
    
    if (!body.resourceType || body.resourceType !== 'Organization') {
      return NextResponse.json(
        { error: 'Resource must be an Organization' },
        { status: 400 }
      );
    }

    // Check if NHFR code is provided for conditional update
    const nhfrIdentifier = body.identifier?.find(
      (id: any) => id.system === 'https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code'
    );
    
    if (nhfrIdentifier && nhfrIdentifier.value) {
      // Use conditional PUT with NHFR identifier
      const result = await fhirConditionalPut(
        'Organization',
        'https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code',
        nhfrIdentifier.value,
        body,
        baseUrl
      );
      return NextResponse.json(result, { status: result.id ? 200 : 201 });
    }

    // Regular POST if no NHFR code
    const result = await fhirPost('Organization', body, baseUrl);
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
      const result = await fhirGet(`Organization/${id}`, baseUrl);
      return NextResponse.json(result);
    }
    
    const result = await fhirGet('Organization?_count=100', baseUrl);
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
      return NextResponse.json({ error: 'Organization ID is required for update' }, { status: 400 });
    }
    const result = await fhirPut('Organization', id, body, baseUrl);
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
      return NextResponse.json({ error: 'Organization ID is required for deletion' }, { status: 400 });
    }
    const result = await fhirDelete('Organization', id, baseUrl);
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
