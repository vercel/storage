import { get } from '@vercel/edge-config';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(): Promise<Response> {
  // eslint-disable-next-line no-console
  console.time('read duration');
  const keyForTest = await get<string>('keyForTest');
  // eslint-disable-next-line no-console
  console.timeEnd('read duration');
  return NextResponse.json({ keyForTest });
}
