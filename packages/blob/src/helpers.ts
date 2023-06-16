import { type BlobCommandOptions } from '.';

export function getToken(options?: BlobCommandOptions): string {
  if (typeof window !== 'undefined') {
    if (!options?.token) {
      throw new BlobError('"token" is required');
    }
    if (!options.token.startsWith('vercel_blob_client')) {
      throw new BlobError('client upload only supports client tokens');
    }
  }
  if (options?.token) {
    return options.token;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN environment variable is not set. Please set it to your write token.',
    );
  }

  return process.env.BLOB_READ_WRITE_TOKEN;
}

export class BlobError extends Error {
  constructor(message: string) {
    super(`Vercel Blob: ${message}`);
  }
}

export class BlobAccessError extends Error {
  constructor() {
    super(
      'Vercel Blob: Access denied, please provide a valid token for this resource',
    );
  }
}

export class BlobUnknownError extends Error {
  constructor() {
    super('Vercel Blob: Unknown error, please contact support@vercel.com');
  }
}
