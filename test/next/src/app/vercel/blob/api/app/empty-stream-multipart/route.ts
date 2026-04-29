import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';
import { validateUploadToken } from '../../../validate-upload-token';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get('filename');

  if (pathname === null) {
    return NextResponse.json({ message: 'Missing filename' }, { status: 400 });
  }

  if (!validateUploadToken(request)) {
    return NextResponse.json({ message: 'Not authorized' }, { status: 401 });
  }

  // Multipart upload with an empty ReadableStream — this used to deadlock
  // because uploadAllParts never called resolve() when the stream was empty.
  const emptyStream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  try {
    const blob = await vercelBlob.put(pathname, emptyStream, {
      access: 'public',
      multipart: true,
      addRandomSuffix: true,
    });

    return NextResponse.json(blob);
  } catch (error) {
    // The server rejects empty multipart uploads ("Invalid body") which is
    // expected. The important thing is that put() resolved instead of hanging.
    return NextResponse.json(
      { resolved: true, error: (error as Error).message },
      { status: 400 },
    );
  }
}
