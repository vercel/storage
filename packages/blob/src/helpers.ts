// common util interface for blob raw commands, not meant to be used directly
// this is why it's not exported from index/client

import { type Response } from 'undici';

export interface BlobCommandOptions {
  /**
   * Define your blob API token.
   * @defaultvalue process.env.BLOB_READ_WRITE_TOKEN
   */
  token?: string;
}

// shared interface for put and copy
export interface CreateBlobCommandOptions extends BlobCommandOptions {
  /**
   * Whether the blob should be publicly accessible. Support for private blobs is planned.
   */
  access: 'public';
  /**
   * Adds a random suffix to the filename.
   * @defaultvalue true
   */
  addRandomSuffix?: boolean;
  /**
   * Defines the content type of the blob. By default, this value is inferred from the pathname. Sent as the 'content-type' header when downloading a blob.
   */
  contentType?: string;
  /**
   * Number in seconds to configure the edge and browser cache. The maximum values are 5 minutes for the edge cache and unlimited for the browser cache.
   * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob#caching
   * @defaultvalue 365 * 24 * 60 * 60 (1 Year)
   */
  cacheControlMaxAge?: number;
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

export class BlobAccessError extends BlobError {
  constructor() {
    super('Access denied, please provide a valid token for this resource');
  }
}

export class BlobStoreNotFoundError extends BlobError {
  constructor() {
    super('This store does not exist');
  }
}

export class BlobStoreSuspendedError extends BlobError {
  constructor() {
    super('This store has been suspended');
  }
}

export class BlobUnknownError extends BlobError {
  constructor() {
    super('Unknown error, please visit https://vercel.com/help');
  }
}

export class BlobNotFoundError extends BlobError {
  constructor() {
    super('The requested blob does not exist');
  }
}

type BlobApiErrorCodes =
  | 'store_suspended'
  | 'forbidden'
  | 'not_found'
  | 'unknown_error'
  | 'bad_request'
  | 'store_not_found'
  | 'not_allowed';

interface BlobApiError {
  error?: { code?: BlobApiErrorCodes; message?: string };
}

export async function validateBlobApiResponse(
  response: Response
): Promise<void> {
  if (!response.ok) {
    if (response.status >= 500) {
      throw new BlobUnknownError();
    } else {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new BlobUnknownError();
      }
      const error = (data as BlobApiError).error;

      switch (error?.code) {
        case 'store_suspended':
          throw new BlobStoreSuspendedError();
        case 'forbidden':
          throw new BlobAccessError();
        case 'not_found':
          throw new BlobNotFoundError();
        case 'store_not_found':
          throw new BlobStoreNotFoundError();
        case 'bad_request':
          throw new BlobError(error.message ?? 'Bad request');
        case 'unknown_error':
        case 'not_allowed':
        default:
          throw new BlobUnknownError();
      }
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
