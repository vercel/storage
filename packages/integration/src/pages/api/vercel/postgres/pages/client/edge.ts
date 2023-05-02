import { NextResponse } from 'next/server';
import { queryUsers } from '@/lib/db-default-client';

export const config = {
  runtime: 'edge',
};

export default async function handler(): Promise<Response> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const users = await queryUsers();
    return NextResponse.json(users);
  } catch (e) {
    return NextResponse.json(
      { message: (e as Error).message },
      { status: 500 },
    );
  }
}
