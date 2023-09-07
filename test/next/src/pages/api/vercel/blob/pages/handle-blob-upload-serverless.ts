import type { NextApiRequest, NextApiResponse } from 'next';
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { validateUploadToken } from '@/app/vercel/blob/validate-upload-token';

export const config = {
  runtime: 'nodejs',
};

export default async function handleBody(
  request: NextApiRequest,
  response: NextApiResponse
): Promise<void> {
  if (!validateUploadToken(request)) {
    return response.status(401).json({ message: 'Not authorized' });
  }

  const body = request.body as string;
  try {
    const jsonResponse = await handleUpload({
      body: JSON.parse(body) as HandleUploadBody,
      request,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await -- [@vercel/style-guide@5 migration]
      onBeforeGenerateToken: async (pathname) => {
        return {
          maximumSizeInBytes: 10_000_000,
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'text/plain',
          ],
          metadata: JSON.stringify({
            userId: 'user.id',
          }),
        };
      },
      // eslint-disable-next-line @typescript-eslint/require-await -- [@vercel/style-guide@5 migration]
      onUploadCompleted: async ({ blob, metadata }) => {
        // eslint-disable-next-line no-console -- [@vercel/style-guide@5 migration]
        console.log('Upload completed', blob, metadata);
        try {
          //   await db.update({ avatar: blob.url, userId: metadata.userId });
        } catch (error) {
          throw new Error('Could not update user');
        }
      },
    });

    return response.json(jsonResponse);
  } catch (error) {
    return response.status(400).json({ error: (error as Error).message });
  }
}
