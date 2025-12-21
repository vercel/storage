import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const prefix = searchParams.get('prefix') ?? '';
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    const listResult = await vercelBlob.list({
      cursor,
      prefix,
    });
    if (listResult.blobs.length > 0) {
      await vercelBlob.del(listResult.blobs.map((blob) => blob.url));
    }
    hasMore = listResult.hasMore;
    cursor = listResult.cursor;
  }

  return NextResponse.json({ success: true });
}
