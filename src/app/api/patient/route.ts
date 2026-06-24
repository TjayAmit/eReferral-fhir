import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields for PH Core Patient profile
    if (!body.resourceType || body.resourceType !== 'Patient') {
      return NextResponse.json(
        { error: 'Resource must be a Patient' },
        { status: 400 }
      );
    }

    // Ensure PH Core identifiers are present
    if (!body.identifier || !Array.isArray(body.identifier)) {
      return NextResponse.json(
        { error: 'Patient must have identifiers (PhilSys, PhilHealth, or NHFR)' },
        { status: 400 }
      );
    }

    const result = await fhirPost('Patient', body);
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
    const identifier = searchParams.get('identifier');
    
    if (identifier) {
      // Search patient by identifier (PhilSys, PhilHealth, or NHFR)
      const result = await fhirGet(`Patient?identifier=${identifier}`);
      return NextResponse.json(result);
    }
    
    // Return all patients if no identifier specified
    const result = await fhirGet('Patient?_count=100');
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
