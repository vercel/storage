import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- [@vercel/style-guide@5 migration]
  const body: { urls: string[] } = await request.json();

  await vercelBlob.del(body.urls);

  return NextResponse.json({ deleted: true });
}
