import type { RequestInit, Response } from 'undici';
import { fetch } from 'undici';
import retry from 'async-retry';
import { debug } from './debug';
import type { BlobCommandOptions } from './helpers';
import { BlobError, getTokenFromOptionsOrEnv } from './helpers';

export class BlobAccessError extends BlobError {
  constructor() {
    super('Access denied, please provide a valid token for this resource.');
  }
}

export class BlobStoreNotFoundError extends BlobError {
  constructor() {
    super('This store does not exist.');
  }
}

export class BlobStoreSuspendedError extends BlobError {
  constructor() {
    super('This store has been suspended.');
  }
}

export class BlobUnknownError extends BlobError {
  constructor() {
    super('Unknown error, please visit https://vercel.com/help.');
  }
}

export class BlobNotFoundError extends BlobError {
  constructor() {
    super('The requested blob does not exist');
  }
}

export class BlobServiceNotAvailable extends BlobError {
  constructor() {
    super('The blob service is currently not available. Please try again.');
  }
}

export class BlobServiceRateLimited extends BlobError {
  public retryAfter: number;

  constructor(seconds?: number) {
    super(
      `Too many requests please lower the number of concurrent requests ${
        seconds ? ` - try again in ${seconds} seconds` : ''
      }.`,
    );

    this.retryAfter = seconds ?? 0;
  }
}

type BlobApiErrorCodes =
  | 'store_suspended'
  | 'forbidden'
  | 'not_found'
  | 'unknown_error'
  | 'bad_request'
  | 'store_not_found'
  | 'not_allowed'
  | 'service_unavailable'
  | 'rate_limited';

export interface BlobApiError {
  error?: { code?: BlobApiErrorCodes; message?: string };
}

// This version is used to ensure that the client and server are compatible
// The server (Vercel Blob API) uses this information to change its behavior like the
// response format
const BLOB_API_VERSION = 7;

function getApiVersion(): string {
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

  return `${versionOverride ?? BLOB_API_VERSION}`;
}

function getApiUrl(pathname = ''): string {
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

function getRetries(): number {
  try {
    const retries = process.env.VERCEL_BLOB_RETRIES || '10';

    return parseInt(retries, 10);
  } catch {
    return 10;
  }
}

function createBlobServiceRateLimited(
  response: Response,
): BlobServiceRateLimited {
  const retryAfter = response.headers.get('retry-after');
  const seconds = parseInt(retryAfter ?? '0', 10);

  return new BlobServiceRateLimited(seconds);
}

// reads the body of a error response
async function getBlobError(
  response: Response,
): Promise<{ code: string; error: BlobError }> {
  let code: BlobApiErrorCodes;
  let message: string | undefined;

  try {
    const data = (await response.json()) as BlobApiError;

    code = data.error?.code ?? 'unknown_error';
    message = data.error?.message;
  } catch {
    code = 'unknown_error';
  }

  let error: BlobError;
  switch (code) {
    case 'store_suspended':
      error = new BlobStoreSuspendedError();
      break;
    case 'forbidden':
      error = new BlobAccessError();
      break;
    case 'not_found':
      error = new BlobNotFoundError();
      break;
    case 'store_not_found':
      error = new BlobStoreNotFoundError();
      break;
    case 'bad_request':
      error = new BlobError(message ?? 'Bad request');
      break;
    case 'service_unavailable':
      error = new BlobServiceNotAvailable();
      break;
    case 'rate_limited':
      error = createBlobServiceRateLimited(response);
      break;
    case 'unknown_error':
    case 'not_allowed':
    default:
      error = new BlobUnknownError();
      break;
  }

  return { code, error };
}

export async function requestApi<TResponse>(
  pathname: string,
  init: RequestInit,
  commandOptions: BlobCommandOptions | undefined,
): Promise<TResponse> {
  const apiVersion = getApiVersion();
  const token = getTokenFromOptionsOrEnv(commandOptions);

  const apiResponse = await retry(
    async (bail) => {
      const res = await fetch(getApiUrl(pathname), {
        ...init,
        headers: {
          'x-api-version': apiVersion,
          authorization: `Bearer ${token}`,

          ...init.headers,
        },
      });

      if (res.ok) {
        return res;
      }

      const { code, error } = await getBlobError(res);

      // only retry for certain errors
      if (code === 'unknown_error' || code === 'service_unavailable') {
        throw error;
      }

      // don't retry for e.g. suspended stores
      bail(error);
    },
    {
      retries: getRetries(),
      onRetry: (error) => {
        debug(`retrying API request to ${pathname}`, error.message);
      },
    },
  );

  if (!apiResponse) {
    throw new BlobUnknownError();
  }

  return (await apiResponse.json()) as TResponse;
}
