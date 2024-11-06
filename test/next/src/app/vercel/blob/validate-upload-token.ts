import type { IncomingMessage } from 'node:http';

export function validateUploadToken(
  request: IncomingMessage | Request,
): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  const cookie =
    'credentials' in request
      ? (request.headers.get('cookie') ?? '')
      : (request.headers.cookie ?? '');

  return Boolean(
    cookie &&
      new RegExp(`clientUpload=${process.env.BLOB_UPLOAD_SECRET ?? ''}`).test(
        cookie,
      ),
  );
}
