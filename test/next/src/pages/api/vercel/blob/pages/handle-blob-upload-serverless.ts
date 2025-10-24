import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { validateUploadToken } from '@/app/vercel/blob/validate-upload-token';

export const config = {
  runtime: 'nodejs',
};

export default async function handleBody(
  request: NextApiRequest,
  response: NextApiResponse,
): Promise<void> {
  if (!validateUploadToken(request)) {
    response.status(401).json({ message: 'Not authorized' });
    return;
  }

  const body = request.body as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname) => {
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 10_000_000,
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'text/plain',
          ],
          tokenPayload: JSON.stringify({
            userId: 'user.id',
          }),
        };
      },
    });

    response.json(jsonResponse);
  } catch (error) {
    response.status(400).json({ error: (error as Error).message });
  }
}
