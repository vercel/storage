import { generateClientTokenFromReadWriteToken } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as { pathname: string };

  return NextResponse.json({
    clientToken: await generateClientTokenFromReadWriteToken({
      ...body,
      onUploadCompleted: {
        callbackUrl: `https://${
          process.env.VERCEL_URL ?? ''
        }/vercel/blob/api/app/file-upload-completed`,
        metadata: JSON.stringify({ foo: 'bar' }),
      },
    }),
  });
}

export const runtime = 'edge';
