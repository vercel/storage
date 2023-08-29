import type { NextApiRequest, NextApiResponse } from 'next';
import * as vercelBlob from '@vercel/blob';
import { validateUploadToken } from '@/app/vercel/blob/validate-upload-token';

export const config = {
  runtime: 'nodejs',
};

export default async function handleBody(
  request: NextApiRequest,
  response: NextApiResponse
): Promise<void> {
  const pathname = request.query.filename as string;

  if (!request.body || !pathname) {
    return response.status(400).json({ message: 'No file to upload.' });
  }

  if (!validateUploadToken(request)) {
    return response.status(401).json({ message: 'Not authorized' });
  }

  // Note: this will stream the file to Vercel's Blob Store
  const blob = await vercelBlob.put(pathname, request.body as string, {
    access: 'public',
  });

  return response.json(blob);
}
