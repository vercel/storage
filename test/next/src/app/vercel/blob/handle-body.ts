import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';
import { validateUploadToken } from './validate-upload-token';

export async function handleBody(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get('filename');
  const multipart = searchParams.get('multipart') === '1';
  const useBuffer = searchParams.get('useBuffer') === '1';

  if (!request.body || pathname === null) {
    return NextResponse.json(
      { message: 'No file to upload.' },
      {
        status: 400,
      },
    );
  }

  if (!validateUploadToken(request)) {
    return NextResponse.json(
      { message: 'Not authorized' },
      {
        status: 401,
      },
    );
  }

  let body: ReadableStream | Buffer;

  if (useBuffer) {
    body = Buffer.from(await request.arrayBuffer());
  } else {
    body = request.body;
  }

  // Note: this will stream the file to Vercel's Blob Store
  const blob = await vercelBlob.put(pathname, body, {
    access: 'public',
    multipart,
  });

  return NextResponse.json(blob);
}
