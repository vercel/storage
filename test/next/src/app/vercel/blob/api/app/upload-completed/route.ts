import { type BlobUploadCompletedEvent } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as BlobUploadCompletedEvent;
  // eslint-disable-next-line no-console
  console.log(body);
  // { type: "blob.upload-completed", payload: { metadata: "custom-metadata", blob: ... }}
  return NextResponse.json({
    response: 'ok',
  });
}
