// common util interface for blob raw commands, not meant to be used directly
// this is why it's not exported from index/client

import { type Response } from 'undici';

export interface BlobCommandOptions {
  token?: string;
}

export function getTokenFromOptionsOrEnv(options?: BlobCommandOptions): string {
  if (options?.token) {
    return options.token;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return process.env.BLOB_READ_WRITE_TOKEN;
  }

  throw new BlobError(
    'No token found. Either configure the `BLOB_READ_WRITE_TOKEN` environment variable, or pass a `token` option to your calls.'
  );
}

export class BlobError extends Error {
  constructor(message: string) {
    super(`Vercel Blob: ${message}`);
  }
}

export class BlobAccessError extends Error {
  constructor() {
    super(
      'Vercel Blob: Access denied, please provide a valid token for this resource'
    );
  }
}

export class BlobNotFoundError extends Error {
  constructor() {
    super('Vercel Blob: This store does not exist');
  }
}

export class BlobSuspendedError extends Error {
  constructor() {
    super('Vercel Blob: This store has been suspended');
  }
}

export class BlobUnknownError extends Error {
  constructor() {
    super('Vercel Blob: Unknown error, please visit https://vercel.com/help');
  }
}

type BlobApiErrorCodes =
  | 'suspended_store'
  | 'forbidden'
  | 'not_found'
  | 'bad_request';

type BlobApiError = { error?: { code: BlobApiErrorCodes } } | undefined;

export async function validateBlobApiResponse(
  response: Response
): Promise<Error | undefined> {
  if (response.status !== 200) {
    if (response.status < 500) {
      let data: BlobApiError;
      try {
        data = (await response.json()) as BlobApiError;
      } catch {
        // ignore
      }
      if (response.status === 404 && data?.error?.code !== 'not_found') {
        // ignore 404 not caused by not existing stores
        return;
      }
      switch (data?.error?.code) {
        case 'suspended_store':
          throw new BlobSuspendedError();
        case 'forbidden':
          throw new BlobAccessError();
        case 'not_found':
          throw new BlobNotFoundError();
        case 'bad_request':
        default:
          throw new BlobUnknownError();
      }
    } else {
      throw new BlobUnknownError();
    }
  }
}

// This version is used to ensure that the client and server are compatible
// The server (Vercel Blob API) uses this information to change its behavior like the
// response format
const BLOB_API_VERSION = 4;

export function getApiVersionHeader(): { 'x-api-version'?: string } {
  let versionOverride = null;
  try {
    // wrapping this code in a try/catch as this function is used in the browser and Vite doesn't define the process.env.
    // As this varaible is NOT used in production, it will always default to the BLOB_API_VERSION
    versionOverride =
      process.env.VERCEL_BLOB_API_VERSION_OVERRIDE ||
      process.env.NEXT_PUBLIC_VERCEL_BLOB_API_VERSION_OVERRIDE;
  } catch {
    // noop
  }

  return {
    'x-api-version': `${versionOverride ?? BLOB_API_VERSION}`,
  };
}

export function getApiUrl(pathname = ''): string {
  let baseUrl = null;
  try {
    // wrapping this code in a try/catch as this function is used in the browser and Vite doesn't define the process.env.
    // As this varaible is NOT used in production, it will always default to production endpoint
    baseUrl =
      process.env.VERCEL_BLOB_API_URL ||
      process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL;
  } catch {
    // noop
  }
  return `${baseUrl || 'https://blob.vercel-storage.com'}${pathname}`;
}
