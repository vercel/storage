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
  return NextResponse.json({
    response: 'ok',
  });
}
