import type { BlobMetadataApi, BlobResult } from '.';

export function getApiUrl(): string {
  return (
    process.env.VERCEL_BLOB_API_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL ||
    'https://blob.vercel-storage.com'
  );
}

export function mapBlobResult(blobResult: BlobMetadataApi): BlobResult {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
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
