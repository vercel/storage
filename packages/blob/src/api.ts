import type { BodyInit, RequestInit, Response } from 'undici';
import { fetch } from 'undici';
import retry from 'async-retry';
import { debug } from './debug';
import type { BlobCommandOptions, WithUploadProgress } from './helpers';
import {
  BlobError,
  computeBodyLength,
  createChunkTransformStream,
  getApiUrl,
  getTokenFromOptionsOrEnv,
  isStream,
  supportsRequestStreams,
} from './helpers';
import { toReadableStream } from './multipart/helpers';
import type { PutBody } from './put-helpers';

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

export class BlobContentTypeNotAllowedError extends BlobError {
  constructor(message: string) {
    super(`Content type mismatch, ${message}.`);
  }
}

export class BlobPathnameMismatchError extends BlobError {
  constructor(message: string) {
    super(
      `Pathname mismatch, ${message}. Check the pathname used in upload() or put() matches the one from the client token.`,
    );
  }
}

export class BlobClientTokenExpiredError extends BlobError {
  constructor() {
    super('Client token has expired.');
  }
}

export class BlobFileTooLargeError extends BlobError {
  constructor(message: string) {
    super(`File is too large, ${message}.`);
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
  | 'rate_limited'
  | 'content_type_not_allowed'
  | 'client_token_pathname_mismatch'
  | 'client_token_expired'
  | 'file_too_large';

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

  // Now that we have multiple API clients out in the wild handling errors, we can't just send a different
  // error code for this type of error. We need to add a new field in the API response to handle this correctly,
  // but for now, we can just check the message.
  if (message?.includes('contentType') && message.includes('is not allowed')) {
    code = 'content_type_not_allowed';
  }

  if (
    message?.includes('"pathname"') &&
    message.includes('does not match the token payload')
  ) {
    code = 'client_token_pathname_mismatch';
  }

  if (message === 'Token expired') {
    code = 'client_token_expired';
  }

  if (message?.includes('the file length cannot be greater than')) {
    code = 'file_too_large';
  }

  let error: BlobError;
  switch (code) {
    case 'store_suspended':
      error = new BlobStoreSuspendedError();
      break;
    case 'forbidden':
      error = new BlobAccessError();
      break;
    case 'content_type_not_allowed':
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- TS, be smarter
      error = new BlobContentTypeNotAllowedError(message!);
      break;
    case 'client_token_pathname_mismatch':
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- TS, be smarter
      error = new BlobPathnameMismatchError(message!);
      break;
    case 'client_token_expired':
      error = new BlobClientTokenExpiredError();
      break;
    case 'file_too_large':
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- TS, be smarter
      error = new BlobFileTooLargeError(message!);
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

const CHUNK_SIZE = 64 * 1024;

export async function requestApi<TResponse>(
  pathname: string,
  init: RequestInit,
  commandOptions: (BlobCommandOptions & WithUploadProgress) | undefined,
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
      let bodyLength: number | undefined;
      let body: BodyInit | undefined;

      if (
        init.body &&
        // 1. For upload progress we always need to know the total size of the body
        // 2. In development we need the header for put() to work correctly when passing a stream
        (commandOptions?.onUploadProgress || shouldUseXContentLength())
      ) {
        bodyLength = computeBodyLength(init.body);
      }

      if (init.body) {
        if (commandOptions?.onUploadProgress) {
          if (supportsRequestStreams) {
            // We transform the body to a stream here instead of at the call site
            // So that on retries we can reuse the original body, otherwise we would not be able to reuse it
            const stream = await toReadableStream(init.body as PutBody);

            let loaded = 0;

            const chunkTransformStream = createChunkTransformStream(
              CHUNK_SIZE,
              (newLoaded: number) => {
                loaded += newLoaded;
                const total = bodyLength ?? loaded;
                const percentage = Number(((loaded / total) * 100).toFixed(2));

                // Leave percentage 100 to end of request
                if (percentage === 100) {
                  return;
                }

                commandOptions.onUploadProgress?.({
                  loaded,
                  // When passing a stream to put(), we have no way to know the total size of the body.
                  // Instead of defining total as total?: number we decided to set the total to the currently
                  // loaded number. This is not inaccurate and way more practical for DX.
                  // Passing down a stream to put() is very rare
                  total,
                  percentage,
                });
              },
            );

            body = stream.pipeThrough(chunkTransformStream);
          } else {
            body = init.body;
          }
        } else {
          body = init.body;
        }
      }

      // Only set duplex option when supported and dealing with a stream body
      const duplex =
        supportsRequestStreams && body && isStream(body as PutBody)
          ? 'half'
          : undefined;

      // try/catch here to treat certain errors as not-retryable
      try {
        res = await fetch(getApiUrl(pathname), {
          ...init,
          ...(init.body ? { body } : {}),
          ...(duplex ? { duplex } : {}),
          headers: {
            'x-api-blob-request-id': requestId,
            'x-api-blob-request-attempt': String(retryCount),
            'x-api-version': apiVersion,
            ...(bodyLength ? { 'x-content-length': String(bodyLength) } : {}),
            authorization: `Bearer ${token}`,
            ...extraHeaders,
            ...init.headers,
          },
        });

        // Calling onUploadProgress here has two benefits:
        // 1. It ensures 100% is only reached at the end of the request. While otherwise you can reach 100%
        // before the request is fully done, as we only really measure what gets sent over the wire, not what
        // has been processed by the server.
        // 2. It makes the uploadProgress "work" even for browsers not supporting request streams like Safari.
        // And in the case of multipart uploads it actually provides a simple progress indication (per part)
        if (commandOptions?.onUploadProgress) {
          commandOptions.onUploadProgress({
            loaded: bodyLength ?? 0,
            total: bodyLength ?? 0,
            percentage: 100,
          });
        }
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

function shouldUseXContentLength(): boolean {
  try {
    return process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH === '1';
  } catch {
    return false;
  }
}
