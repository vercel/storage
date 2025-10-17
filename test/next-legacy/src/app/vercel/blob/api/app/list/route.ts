import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = parseInt(searchParams.get('limit') ?? '', 10);
  const prefix = searchParams.get('prefix') ?? '';

  const data = await vercelBlob.list({
    cursor,
    limit,
    prefix,
  });

  return NextResponse.json(data);
}
