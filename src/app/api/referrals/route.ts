import { NextRequest, NextResponse } from 'next/server';
import { fhirGet, FhirError } from '@/lib/fhir';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'all', 'outgoing', 'incoming'
    const organizationId = searchParams.get('organizationId');
    
    if (type === 'all') {
      // Admin view - fetch all tasks (referrals)
      const result = await fhirGet('Task?_include=Task:focus&_include=Task:patient&_include=Task:requester&_sort=-authored-on&_count=100');
      return NextResponse.json(result);
    }
    
    if (type === 'outgoing' && organizationId) {
      // Outgoing referrals - tasks where requester is this organization
      const result = await fhirGet(`Task?requester=Organization/${organizationId}&_include=Task:focus&_include=Task:patient&_sort=-authored-on&_count=100`);
      return NextResponse.json(result);
    }
    
    if (type === 'incoming' && organizationId) {
      // Incoming referrals - tasks where the receiving organization is this one
      // This requires searching based on the ServiceRequest or Task owner
      const result = await fhirGet(`Task?_include=Task:focus&_include=Task:patient&_sort=-authored-on&_count=100`);
      
      // Filter client-side to find tasks for this organization
      // In production, this should be done server-side with proper indexing
      const filteredTasks = {
        ...result,
        entry: result.entry?.filter((entry: any) => {
          const task = entry.resource;
          // Check if task is for this organization (via owner or related resources)
          if (task.owner?.reference === `Organization/${organizationId}`) {
            return true;
          }
          // Check ServiceRequest performer
          if (task.focus?.reference) {
            // Would need to fetch ServiceRequest to check performer
            // For now, return all and filter on client
            return true;
          }
          return false;
        }) || []
      };
      
      return NextResponse.json(filteredTasks);
    }
    
    // Default - return all if no type specified
    const result = await fhirGet('Task?_include=Task:focus&_include=Task:patient&_sort=-authored-on&_count=100');
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
