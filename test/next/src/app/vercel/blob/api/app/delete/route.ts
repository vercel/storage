import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body: { urls: string[] } = await request.json();

  if (body.urls.length > 0) {
    await vercelBlob.del(body.urls);
  }

  return NextResponse.json({ deleted: true });
}
