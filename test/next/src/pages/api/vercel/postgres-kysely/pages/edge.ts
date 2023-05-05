import { NextResponse } from 'next/server';
import { queryUsers } from '@/lib/postgres-kysely';

export const config = {
  runtime: 'edge',
};

export default async function handler(): Promise<Response> {
  try {
    const users = await queryUsers();
    return NextResponse.json(users);
  } catch (e) {
    return NextResponse.json(
      { message: (e as Error).message },
      { status: 500 },
    );
  }
}
