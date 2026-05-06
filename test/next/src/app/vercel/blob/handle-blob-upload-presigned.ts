import { issueSignedToken } from '@vercel/blob';
import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { validateUploadToken } from './validate-upload-token';

async function auth(
  request: Request,
  _pathname: string,
): Promise<{ user: { id: string } | null; userRole: 'hobby' | 'pro' }> {
  if (!validateUploadToken(request)) {
    return {
      userRole: 'hobby',
      user: null,
    };
  }

  // faking an async auth call
  await Promise.resolve();

  return {
    user: { id: '12345' },
    userRole: 'pro',
  };
}

// Upload button

// { delegationToken }

// Presigned URLs include signed `vercel-blob-*` constraint params + delegation + signature.

const getCachedToken = async () => {
  // fake: get from cache if it's there
  return await issueSignedToken({
    pathname: '*',
    allowedContentTypes: ['image/png', 'image/jpeg', 'video/mp4'],
    maximumSizeInBytes: 1024 * 1024 * 10, // 10MB,
    operations: ['put'],
    validUntil: Date.now() + 60 * 60 * 1000, // 1 hour
  });
};

export async function handleUploadPresignedHandler(
  request: Request,
): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadPresignedBody;

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        const { user, userRole } = await auth(request, pathname);

        if (!user) {
          throw new Error('Not authorized');
        }

        const token = await getCachedToken();

        // Allow pro to upload image and video, hobby only image
        const allowedContentTypes =
          userRole === 'pro'
            ? ['image/png', 'image/jpeg', 'video/mp4']
            : ['image/png', 'image/jpeg'];

        // Allow pro to upload up to 10MB, hobby up to 5MB
        const maximumSizeInBytes =
          userRole === 'pro' ? 1024 * 1024 * 10 : 1024 * 1024 * 5;

        return {
          token,
          urlOpts: {
            operation: 'put' as const,
            pathname,
            allowedContentTypes,
            maximumSizeInBytes,
            validUntil: Date.now() + 60 * 10 * 1000, // 10 minutes (≤ delegation; may set vercel-blob-valid-until)
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: 30 * 24 * 60 * 60, // 30 days
          },
        };
      },
      onUploadCompleted: async (body) => {
        console.log('onUploadCompleted', body);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { error: message },
      { status: message === 'Not authorized' ? 401 : 400 },
    );
  }
}
