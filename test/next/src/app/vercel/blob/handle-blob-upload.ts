import { handleBlobUpload, type HandleBlobUploadBody } from '@vercel/blob';
import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/require-await
async function auth(
  _request: Request,
  _pathname: string,
): Promise<{ user: { id: string }; userCanUpload: boolean }> {
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
          throw new Error('not authenticated or bad pathname');
        }

        return {
          maxFileSize: 10_000_000,
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'text/plain',
          ],
          metadata: JSON.stringify({
            userId: user.id,
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
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
