import type { IncomingMessage } from 'node:http';

export function validateUploadToken(
  request: IncomingMessage | Request,
): boolean {
  if (process.env.NODE_ENV === 'development') return true;

  // Check for authorization header
  const authHeader =
    'credentials' in request
      ? (request.headers.get('authorization') ?? '')
      : (request.headers.authorization ?? '');

  // Validate Bearer token if present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    // Example validation - in real app, you'd validate against your auth system
    return token === 'your-token-here' || token === 'test-token';
  }

  // Fall back to cookie validation
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
