import type { Response } from 'undici';
import retry from 'async-retry';
import isNetworkError from './is-network-error';
import { debug } from './debug';
import type {
  BlobCommandOptions,
  BlobRequestInit,
  WithUploadProgress,
} from './helpers';
import {
  BlobError,
  computeBodyLength,
  getApiUrl,
  getTokenFromOptionsOrEnv,
} from './helpers';
import { blobRequest } from './request';
import { DOMException } from './dom-exception';

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
const BLOB_API_VERSION = 9;

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

export async function requestApi<TResponse>(
  pathname: string,
  init: BlobRequestInit,
  commandOptions: (BlobCommandOptions & WithUploadProgress) | undefined,
): Promise<TResponse> {
  const apiVersion = getApiVersion();
  const token = getTokenFromOptionsOrEnv(commandOptions);
  const extraHeaders = getProxyThroughAlternativeApiHeaderFromEnv();

  const [, , , storeId = ''] = token.split('_');
  const requestId = `${storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  let retryCount = 0;
  let bodyLength = 0;
  let totalLoaded = 0;
  const sendBodyLength =
    commandOptions?.onUploadProgress || shouldUseXContentLength();

  if (
    init.body &&
    // 1. For upload progress we always need to know the total size of the body
    // 2. In development we need the header for put() to work correctly when passing a stream
    sendBodyLength
  ) {
    bodyLength = computeBodyLength(init.body);
  }

  if (commandOptions?.onUploadProgress) {
    commandOptions.onUploadProgress({
      loaded: 0,
      total: bodyLength,
      percentage: 0,
    });
  }

  const apiResponse = await retry(
    async (bail) => {
      let res: Response;

      // try/catch here to treat certain errors as not-retryable
      try {
        res = await blobRequest({
          input: getApiUrl(pathname),
          init: {
            ...init,
            headers: {
              'x-api-blob-request-id': requestId,
              'x-api-blob-request-attempt': String(retryCount),
              'x-api-version': apiVersion,
              ...(sendBodyLength
                ? { 'x-content-length': String(bodyLength) }
                : {}),
              authorization: `Bearer ${token}`,
              ...extraHeaders,
              ...init.headers,
            },
          },
          onUploadProgress: commandOptions?.onUploadProgress
            ? (loaded) => {
                const total = bodyLength !== 0 ? bodyLength : loaded;
                totalLoaded = loaded;
                const percentage =
                  bodyLength > 0
                    ? Number(((loaded / total) * 100).toFixed(2))
                    : 0;

                // Leave percentage 100 for the end of request
                if (percentage === 100 && bodyLength > 0) {
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
              }
            : undefined,
        });
      } catch (error) {
        // if the request was aborted, don't retry
        if (error instanceof DOMException && error.name === 'AbortError') {
          bail(new BlobRequestAbortedError());
          return;
        }

        // We specifically target network errors because fetch network errors are regular TypeErrors
        // We want to retry for network errors, but not for other TypeErrors
        if (isNetworkError(error)) {
          throw error;
        }

        // If we messed up the request part, don't even retry
        if (error instanceof TypeError) {
          bail(error);
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
        if (error instanceof Error) {
          debug(`retrying API request to ${pathname}`, error.message);
        }

        retryCount = retryCount + 1;
      },
    },
  );

  if (!apiResponse) {
    throw new BlobUnknownError();
  }

  // Calling onUploadProgress here has two benefits:
  // 1. It ensures 100% is only reached at the end of the request. While otherwise you can reach 100%
  // before the request is fully done, as we only really measure what gets sent over the wire, not what
  // has been processed by the server.
  // 2. It makes the uploadProgress "work" even in rare cases where fetch/xhr onprogress is not working
  // And in the case of multipart uploads it actually provides a simple progress indication (per part)
  if (commandOptions?.onUploadProgress) {
    commandOptions.onUploadProgress({
      loaded: totalLoaded,
      total: totalLoaded,
      percentage: 100,
    });
  }

  return (await apiResponse.json()) as TResponse;
}

function getProxyThroughAlternativeApiHeaderFromEnv(): {
  'x-proxy-through-alternative-api'?: string;
} {
  const extraHeaders: Record<string, string> = {};

  try {
    if (
      'VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API' in process.env &&
      process.env.VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API !== undefined
    ) {
      extraHeaders['x-proxy-through-alternative-api'] =
        process.env.VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API;
    } else if (
      'NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API' in process.env &&
      process.env.NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API !==
        undefined
    ) {
      extraHeaders['x-proxy-through-alternative-api'] =
        process.env.NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API;
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
