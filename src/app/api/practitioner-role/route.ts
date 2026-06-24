import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, fhirPut, fhirDelete, fhirConditionalPut, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.resourceType || body.resourceType !== 'PractitionerRole') {
      return NextResponse.json(
        { error: 'Resource must be a PractitionerRole' },
        { status: 400 }
      );
    }

    // Validate required references
    if (!body.practitioner || !body.organization) {
      return NextResponse.json(
        { error: 'PractitionerRole must reference both practitioner and organization' },
        { status: 400 }
      );
    }

    // Check if role ID is provided for conditional update
    const roleIdIdentifier = body.identifier?.find(
      (id: any) => id.system === 'https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id'
    );
    
    if (roleIdIdentifier && roleIdIdentifier.value) {
      // Use conditional PUT with role ID identifier
      const result = await fhirConditionalPut(
        'PractitionerRole',
        'https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id',
        roleIdIdentifier.value,
        body
      );
      return NextResponse.json(result, { status: result.id ? 200 : 201 });
    }

    // Regular POST if no role ID
    const result = await fhirPost('PractitionerRole', body);
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
    const practitioner = searchParams.get('practitioner');
    const organization = searchParams.get('organization');
    
    let query = 'PractitionerRole?_count=100';
    if (practitioner) {
      query += `&practitioner=${practitioner}`;
    }
    if (organization) {
      query += `&organization=${organization}`;
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

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: 'PractitionerRole ID is required for update' }, { status: 400 });
    }
    const result = await fhirPut('PractitionerRole', id, body);
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
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'PractitionerRole ID is required for deletion' }, { status: 400 });
    }
    const result = await fhirDelete('PractitionerRole', id);
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
