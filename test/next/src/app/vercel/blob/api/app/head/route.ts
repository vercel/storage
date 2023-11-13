import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as { url: string };
  if (!body.url)
    return NextResponse.json(new Error('url is required'), { status: 400 });

  return NextResponse.json(await vercelBlob.head(body.url));
}
