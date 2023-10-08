import { NextResponse } from 'next/server';
import { get } from '@vercel/edge-config';

export const runtime = 'edge';

export async function GET(): Promise<Response> {
  const keyForTest = await get<string>('keyForTest');
  return NextResponse.json({ keyForTest });
}
