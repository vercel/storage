import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const prefix = searchParams.get('prefix') ?? '';
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    // eslint-disable-next-line no-await-in-loop -- [@vercel/style-guide@5 migration]
    const listResult = await vercelBlob.list({
      cursor,
      prefix,
    });
    // eslint-disable-next-line no-await-in-loop -- [@vercel/style-guide@5 migration]
    await vercelBlob.del(listResult.blobs.map((blob) => blob.url));
    hasMore = listResult.hasMore;
    cursor = listResult.cursor;
  }

  return NextResponse.json({ success: true });
}
