import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const prefix = searchParams.get('prefix') ?? '';
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    // eslint-disable-next-line no-await-in-loop
    const listResult = await vercelBlob.list({
      cursor,
      prefix,
    });
    // eslint-disable-next-line no-await-in-loop
    await vercelBlob.del(listResult.blobs.map((blob) => blob.url));
    hasMore = listResult.hasMore;
    cursor = listResult.cursor;
  }

  return NextResponse.json({ success: true });
}
