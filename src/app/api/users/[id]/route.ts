import { NextRequest, NextResponse } from 'next/server';
import { updateUser, deleteUser, getUserById } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { id } = params;
    
    const updatedUser = await updateUser(id, body);
    
    // Remove password from response
    const { password, ...safeUser } = updatedUser;
    return NextResponse.json(safeUser);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: error instanceof Error && error.message.includes('not found') ? 404 : 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await deleteUser(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 }
    );
  }
}
