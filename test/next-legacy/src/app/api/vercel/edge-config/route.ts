import { get } from '@vercel/edge-config';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(): Promise<Response> {
  const before = Date.now();
  const keyForTest = await get<string>('keyForTest');
  const after = Date.now();
  return NextResponse.json({ keyForTest, durationMs: after - before });
}
