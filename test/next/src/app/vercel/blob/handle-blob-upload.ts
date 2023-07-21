import { handleBlobUpload, type HandleBlobUploadBody } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { validateUploadToken } from './validate-upload-token';

// eslint-disable-next-line @typescript-eslint/require-await
async function auth(
  request: Request,
  _pathname: string,
): Promise<{ user: { id: string } | null; userCanUpload: boolean }> {
  if (!validateUploadToken(request) && process.env.NODE_ENV !== 'development') {
    return {
      userCanUpload: false,
      user: null,
    };
  }
  return {
    user: { id: '12345' },
    userCanUpload: true,
  };
}

export async function handleBlobUploadHandler(
  request: Request,
): Promise<NextResponse> {
  const body = (await request.json()) as HandleBlobUploadBody;
  try {
    const jsonResponse = await handleBlobUpload({
      body,
      request,
      // token: VERCEL_BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const { user, userCanUpload } = await auth(request, pathname);

        if (!userCanUpload) {
          throw new Error('Not authorized');
        }

        return {
          maximumSizeInBytes: 10_000_000,
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'text/plain',
          ],
          metadata: JSON.stringify({
            userId: user?.id,
          }),
        };
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      onUploadCompleted: async ({ blob, metadata }) => {
        // eslint-disable-next-line no-console
        console.log('Upload completed', blob, metadata);
        try {
          //   await db.update({ avatar: blob.url, userId: metadata.userId });
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
