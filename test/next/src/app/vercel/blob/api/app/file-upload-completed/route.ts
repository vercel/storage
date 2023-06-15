import {
  type BlobUploadCompletedEvent,
  verifyCallbackSignature,
} from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as BlobUploadCompletedEvent;

  // eslint-disable-next-line no-console
  console.log(body);
  if (
    !(await verifyCallbackSignature({
      signature: request.headers.get('x-vercel-signature') ?? '',
      body: JSON.stringify(body),
    }))
  ) {
    return NextResponse.json(
      {
        response: 'invalid signature',
      },
      {
        status: 403,
      },
    );
  }
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  const metadata = JSON.parse(body.payload.metadata as string) as {
    userId: string;
  };
  const blob = body.payload.blob;

  // eslint-disable-next-line no-console
  console.log(metadata.userId); // 12345
  // eslint-disable-next-line no-console
  console.log(blob); // { url: '...', size: ..., uploadedAt: ..., ... }

  return NextResponse.json({
    response: 'ok',
  });
}
