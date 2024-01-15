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

type BlobApiErrorCodes =
  | 'store_suspended'
  | 'forbidden'
  | 'not_found'
  | 'unknown_error'
  | 'bad_request'
  | 'store_not_found'
  | 'not_allowed'
  | 'service_unavailable';

export interface BlobApiError {
  error?: { code?: BlobApiErrorCodes; message?: string };
}

// This version is used to ensure that the client and server are compatible
// The server (Vercel Blob API) uses this information to change its behavior like the
// response format
const BLOB_API_VERSION = 6;

function getApiVersionHeader(): { 'x-api-version'?: string } {
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

async function validateBlobApiResponse(response: Response): Promise<void> {
  if (!response.ok) {
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
      case 'service_unavailable':
        throw new BlobServiceNotAvailable();
      case 'unknown_error':
      case 'not_allowed':
      default:
        throw new BlobUnknownError();
    }
  }
}

export async function requestApi<TResponse>(
  pathname: string,
  options: RequestInit,
  commandOptions: BlobCommandOptions | undefined,
): Promise<TResponse> {
  const apiUrl = new URL(getApiUrl(pathname));

  options.headers = {
    ...getApiVersionHeader(),
    authorization: `Bearer ${getTokenFromOptionsOrEnv(commandOptions)}`,

    ...options.headers,
  };

  const apiResponse = await retry(
    async () => {
      const res = await fetch(apiUrl, options);

      if (res.status >= 500) {
        // this will be retried
        throw new BlobServiceNotAvailable();
      }

      return res;
    },
    {
      retries: commandOptions?.retries ?? 10,
      onRetry: (error) => {
        debug(`retrying API request to ${pathname}`, error.message);
      },
    },
  );

  await validateBlobApiResponse(apiResponse);

  return (await apiResponse.json()) as TResponse;
}
