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
): Promise<{ user: { id: string } | null; userCanUpload: boolean }> {
  if (!validateUploadToken(request)) {
    return {
      userCanUpload: false,
      user: null,
    };
  }

  // faking an async auth call
  await Promise.resolve();

  return {
    user: { id: '12345' },
    userCanUpload: true,
  };
}

const getCachedToken = async (
  pathname: string,
  clientPayload: string | null,
  multipart: boolean,
) => {
  // fake: get from cache if it's there
  return await issueSignedToken({
    pathname,
    allowedContentTypes: ['image/png', 'image/jpeg'],
    maximumSizeInBytes: 1024 * 1024 * 10, // 10MB
    validUntil: Date.now() + 1000 * 60 * 60 * 24, // 1 day
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: 30 * 24 * 60 * 60, // 30 days
    operations: ['put'],
  });
};

export async function handleUploadPresignedHandler(
  request: Request,
): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadPresignedBody;

  // Log all headers received
  console.log('Request headers:');
  request.headers.forEach((value, key) => {
    console.log(`${key}: ${value}`);
  });

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload, multipart) => {
        console.log('in getSignedToken');
        const { user, userCanUpload } = await auth(request, pathname);

        if (!userCanUpload) {
          throw new Error('Not authorized');
        }

        // You can now access headers in the authorization logic
        const customHeader =
          request.headers.get('X-Custom-Header') ||
          request.headers.get('X-Test-Header');
        console.log('Custom header received:', customHeader);

        try {
          const token = await getCachedToken(
            pathname,
            clientPayload,
            multipart,
          );
          console.log('token', token);
          return token;
        } catch (error) {
          console.error('Error in getCachedToken:', error);
          throw error;
        }
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
