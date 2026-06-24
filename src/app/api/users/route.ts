import { NextRequest, NextResponse } from 'next/server';
import {
  getAllUsers,
  getUserById,
  getUsersByPractitionerId,
  createUser,
  type UserAccount,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const practitionerId = searchParams.get('practitionerId');

    if (id) {
      const user = await getUserById(id);
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const { password, ...safe } = user;
      return NextResponse.json(safe);
    }

    let users = practitionerId
      ? await getUsersByPractitionerId(practitionerId)
      : await getAllUsers();

    return NextResponse.json(users.map(({ password, ...u }) => u));
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (!body.role || !['admin', 'practitioner'].includes(body.role)) {
      return NextResponse.json({ error: 'Role must be admin or practitioner' }, { status: 400 });
    }

    const newUser = await createUser({
      email: body.email,
      password: body.password,
      role: body.role,
      practitionerId: body.practitionerId,
    });

    const { password, ...safe } = newUser;
    return NextResponse.json(safe, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: error instanceof Error && error.message.includes('already exists') ? 409 : 500 }
    );
  }
}
