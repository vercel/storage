import type { RequestInit, Response } from 'undici';
import { fetch } from 'undici';
import retry from 'async-retry';
import { debug } from './debug';
import type { BlobCommandOptions } from './helpers';
import { BlobError, getTokenFromOptionsOrEnv } from './helpers';

// maximum pathname length is:
// 1024 (provider limit) - 26 chars (vercel  internal suffixes) - 31 chars (blob `-randomId` suffix) = 967
// we round it to 950 to make it more human friendly, and we apply the limit whatever the value of
// addRandomSuffix is, to make it consistent
export const MAXIMUM_PATHNAME_LENGTH = 950;

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
  public readonly retryAfter: number;

  constructor(seconds?: number) {
    super(
      `Too many requests please lower the number of concurrent requests ${
        seconds ? ` - try again in ${seconds} seconds` : ''
      }.`,
    );

    this.retryAfter = seconds ?? 0;
  }
}

export class BlobRequestAbortedError extends BlobError {
  constructor() {
    super('The request was aborted.');
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

  return new BlobServiceRateLimited(
    retryAfter ? parseInt(retryAfter, 10) : undefined,
  );
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
  const extraHeaders = getProxyThroughAlternativeApiHeaderFromEnv();

  const [, , , storeId = ''] = token.split('_');
  const requestId = `${storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  let retryCount = 0;

  const apiResponse = await retry(
    async (bail) => {
      let res: Response;

      // try/catch here to treat certain errors as not-retryable
      try {
        res = await fetch(getApiUrl(pathname), {
          ...init,
          headers: {
            'x-api-blob-request-id': requestId,
            'x-api-blob-request-attempt': String(retryCount),
            'x-api-version': apiVersion,
            authorization: `Bearer ${token}`,
            ...extraHeaders,
            ...init.headers,
          },
        });
      } catch (error) {
        // if the request was aborted, don't retry
        if (error instanceof DOMException && error.name === 'AbortError') {
          bail(new BlobRequestAbortedError());
          return;
        }

        // retry for any other erros thrown by fetch
        throw error;
      }

      if (res.ok) {
        return res;
      }

      const { code, error } = await getBlobError(res);

      // only retry for certain errors
      if (
        code === 'unknown_error' ||
        code === 'service_unavailable' ||
        code === 'internal_server_error'
      ) {
        throw error;
      }

      // don't retry for e.g. suspended stores
      bail(error);
    },
    {
      retries: getRetries(),
      onRetry: (error) => {
        debug(`retrying API request to ${pathname}`, error.message);
        retryCount = retryCount + 1;
      },
    },
  );

  if (!apiResponse) {
    throw new BlobUnknownError();
  }

  return (await apiResponse.json()) as TResponse;
}

function getProxyThroughAlternativeApiHeaderFromEnv(): {
  'x-proxy-through-alternative-api'?: string;
} {
  const extraHeaders: Record<string, string> = {};

  try {
    if ('VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API' in process.env) {
      extraHeaders['x-proxy-through-alternative-api'] =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we know it's here from the if
        process.env.VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API!;
    } else if (
      'NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API' in process.env
    ) {
      extraHeaders['x-proxy-through-alternative-api'] =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we know it's here from the if
        process.env.NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API!;
    }
  } catch {
    // noop
  }

  return extraHeaders;
}
