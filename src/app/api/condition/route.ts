import { NextRequest, NextResponse } from 'next/server';
import { fhirPost, fhirGet, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.resourceType || body.resourceType !== 'Condition') {
      return NextResponse.json(
        { error: 'Resource must be a Condition' },
        { status: 400 }
      );
    }

    // Validate category for encounter-diagnosis
    if (!body.category || !Array.isArray(body.category)) {
      return NextResponse.json(
        { error: 'Condition must have a category (e.g., encounter-diagnosis)' },
        { status: 400 }
      );
    }

    const result = await fhirPost('Condition', body);
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
    const category = searchParams.get('category');
    
    let query = 'Condition?_count=100';
    if (patient) {
      query += `&subject=${patient}`;
    }
    if (category) {
      query += `&category=${category}`;
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
