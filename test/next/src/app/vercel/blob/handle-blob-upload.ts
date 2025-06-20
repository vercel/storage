import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
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

export async function handleUploadHandler(
  request: Request,
): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // Log all headers received
  console.log('Request headers:');
  request.headers.forEach((value, key) => {
    console.log(`${key}: ${value}`);
  });

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      // token: VERCEL_BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const { user, userCanUpload } = await auth(request, pathname);

        if (!userCanUpload) {
          throw new Error('Not authorized');
        }

        // You can now access headers in the authorization logic
        const customHeader =
          request.headers.get('X-Custom-Header') ||
          request.headers.get('X-Test-Header');
        console.log('Custom header received:', customHeader);

        return {
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: user?.id,
            customHeader,
          }),
        };
      },
      // eslint-disable-next-line @typescript-eslint/require-await -- [@vercel/style-guide@5 migration]
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Upload completed', blob, tokenPayload);
        try {
          //   await db.update({ avatar: blob.url, userId: tokenPayload.userId });
        } catch (error) {
          throw new Error('Could not update user');
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
