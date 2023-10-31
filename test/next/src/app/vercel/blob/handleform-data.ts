import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';
import { validateUploadToken } from './validate-upload-token';

export async function handleFormData(request: Request): Promise<NextResponse> {
  const form = await request.formData();

  // Note: this will buffer the file in memory, fine for small files
  const file = form.get('file') as File;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- [@vercel/style-guide@5 migration]
  if (!file) {
    return NextResponse.json(
      { message: 'No file to upload.' },
      {
        status: 400,
      },
    );
  }

  if (!validateUploadToken(request)) {
    return NextResponse.json(
      { message: 'Not authorized' },
      {
        status: 401,
      },
    );
  }
  const blob = await vercelBlob.put(file.name, file, {
    access: 'public',
  });

  return NextResponse.json(blob);
}
