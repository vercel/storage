import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const body: { url: string } = await request.json();
  if (!body.url)
    return NextResponse.json(new Error('url is required'), { status: 400 });

  return NextResponse.json(await vercelBlob.head(body.url));
}
