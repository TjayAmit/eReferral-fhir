import { NextRequest, NextResponse } from 'next/server';
import { submitTransaction, FhirError } from '@/lib/fhir';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.resourceType || body.resourceType !== 'Bundle') {
      return NextResponse.json(
        { error: 'Resource must be a Bundle' },
        { status: 400 }
      );
    }

    if (body.type !== 'transaction') {
      return NextResponse.json(
        { error: 'Bundle type must be "transaction"' },
        { status: 400 }
      );
    }

    if (!body.entry || !Array.isArray(body.entry)) {
      return NextResponse.json(
        { error: 'Bundle must contain entries' },
        { status: 400 }
      );
    }

    // Validate each entry has required fields
    for (const entry of body.entry) {
      if (!entry.resource) {
        return NextResponse.json(
          { error: 'Each bundle entry must have a resource' },
          { status: 400 }
        );
      }
      if (!entry.request) {
        return NextResponse.json(
          { error: 'Each bundle entry must have a request (method, url)' },
          { status: 400 }
        );
      }
    }

    const result = await submitTransaction(body);
    return NextResponse.json(result, { status: 200 });
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
