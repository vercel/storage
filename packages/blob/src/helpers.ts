// common util interface for blob raw commands, not meant to be used directly
// this is why it's not exported from index/client

import type { Readable } from 'node:stream';
import { isNodeProcess } from 'is-node-process';
import type { RequestInit, Response } from 'undici';
import { isNodeJsReadableStream } from './multipart/helpers';
import type { PutBody } from './put-helpers';
import { getVercelOidcToken } from './vercel-oidc-token';

export { bytes } from './bytes';

const defaultVercelBlobApiUrl = 'https://vercel.com/api/blob';

export interface BlobCommandOptions {
  /**
   * Define your blob API token.
   * When supplied, this takes priority over process.env.VERCEL_OIDC_TOKEN and process.env.BLOB_READ_WRITE_TOKEN.
   * @defaultvalue process.env.BLOB_READ_WRITE_TOKEN
   */
  token?: string;
  /**
   * Blob store id. Used to override process.env.BLOB_STORE_ID when Vercel OIDC token is available.
   * @defaultvalue process.env.BLOB_STORE_ID
   */
  storeId?: string;
  /**
   * `AbortSignal` to cancel the running request. See https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
   */
  abortSignal?: AbortSignal;
}

export interface PresignedUrlPayload {
  delegationToken: string;
  signature: string;
  options: Record<string, string>;
}

/**
 * Presigned control-plane URL for writes (`put`, `copy`, multipart) and other
 * methods built on {@link CommonCreateBlobOptions}. When set, it is used as the
 * fetch target instead of composing `getApiUrl` with a bearer token.
 */
export interface BlobPresignedCommandOptions extends BlobCommandOptions {
  /**
   * Takes precedence over `token` and store credentials for supported calls.
   */
  presignedUrlPayload?: PresignedUrlPayload;
}

/**
 * The access level of a blob.
 * - 'public': The blob is publicly accessible via its URL.
 * - 'private': The blob requires authentication to access.
 */
export type BlobAccessType = 'public' | 'private';

// shared interface for put, copy and multipart upload
export interface CommonCreateBlobOptions extends BlobPresignedCommandOptions {
  /**
   * Whether the blob should be publicly accessible.
   * - 'public': The blob will be publicly accessible via its URL.
   * - 'private': The blob will require authentication to access.
   */
  access: BlobAccessType;
  /**
   * Adds a random suffix to the filename.
   * @defaultvalue false
   */
  addRandomSuffix?: boolean;
  /**
   * Allow overwriting an existing blob. By default this is set to false and will throw an error if the blob already exists.
   * @defaultvalue false
   */
  allowOverwrite?: boolean;
  /**
   * Defines the content type of the blob. By default, this value is inferred from the pathname. Sent as the 'content-type' header when downloading a blob.
   */
  contentType?: string;
  /**
   * Number in seconds to configure the edge and browser cache. The minimum is 1 minute. There's no maximum but keep in mind that browser and edge caches will do a best effort to respect this value.
   * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob#caching
   * @defaultvalue 30 * 24 * 60 * 60 (1 Month)
   */
  cacheControlMaxAge?: number;
  /**
   * Only perform the operation if the blob's current ETag matches this value.
   * Use this for optimistic concurrency control to prevent overwriting changes made by others.
   * If the ETag doesn't match, a `BlobPreconditionFailedError` will be thrown.
   */
  ifMatch?: string;
  /**
   * Maximum size in bytes allowed for this upload. Currently only enforced
   * client-side for multipart uploads (`put(..., { multipart: true })`).
   * For bodies with a known size (Blob, File, Buffer, etc.) the check is
   * performed before the upload starts. Streams cannot be checked upfront.
   * The maximum allowed value is 5TB.
   */
  maximumSizeInBytes?: number;
}

/**
 * Event object passed to the onUploadProgress callback.
 */
export interface UploadProgressEvent {
  /**
   * The number of bytes uploaded.
   */
  loaded: number;

  /**
   * The total number of bytes to upload.
   */
  total: number;

  /**
   * The percentage of the upload that has been completed.
   */
  percentage: number;
}

/**
 * Callback type for tracking upload progress.
 */
export type OnUploadProgressCallback = (
  progressEvent: UploadProgressEvent,
) => void;

export type InternalOnUploadProgressCallback = (loaded: number) => void;

export type BlobRequestInit = Omit<RequestInit, 'body'> & { body?: PutBody };

export type BlobRequest = ({
  input,
  init,
  onUploadProgress,
}: {
  input: string | URL;
  init: BlobRequestInit;
  onUploadProgress?: InternalOnUploadProgressCallback;
}) => Promise<Response>;

/**
 * Interface for including upload progress tracking capabilities.
 */
export interface WithUploadProgress {
  /**
   * Callback to track the upload progress. You will receive an object with the following properties:
   * - `loaded`: The number of bytes uploaded
   * - `total`: The total number of bytes to upload
   * - `percentage`: The percentage of the upload that has been completed
   */
  onUploadProgress?: OnUploadProgressCallback;
}

function readEnv(name: string): string | undefined {
  try {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export type ResolvedBlobAuth =
  | { kind: 'readWrite' | 'oidc'; token: string; storeId: string }
  | { kind: 'presigned'; storeId: string };

export function parseStoreIdFromReadWriteToken(token: string): string {
  const [, , , storeId = ''] = token.split('_');
  return storeId;
}

function normalizeDelegationStoreId(storeId: string): string {
  return storeId.startsWith('store_')
    ? storeId.slice('store_'.length)
    : storeId;
}

function base64UrlDecodeDelegationSegment(segment: string): string {
  let base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = 4 - (base64.length % 4);
  if (padding !== 4) {
    base64 += '='.repeat(padding);
  }
  if (typeof atob === 'function') {
    return atob(base64);
  }
  if (typeof Buffer !== 'undefined') {
    // eslint-disable-next-line no-restricted-globals
    return Buffer.from(base64, 'base64').toString('utf8');
  }
  throw new BlobError('Cannot decode base64: no atob or Buffer available.');
}

/**
 * Reads `storeId` from the delegation JWT embedded in a presigned blob URL’s
 * `vercel-blob-delegation` query parameter (same payload shape as `issueSignedToken` delegations).
 */
/**
 * Reads `storeId` from a delegation JWT’s payload segment (same format as
 * embedded in a presigned URL’s `vercel-blob-delegation` query parameter).
 */
export function parseStoreIdFromDelegationToken(
  delegationToken: string,
): string {
  const dot = delegationToken.indexOf('.');
  if (dot < 0) {
    throw new BlobError('Invalid delegation token format.');
  }

  const payloadSeg = delegationToken.slice(0, dot);
  let parsed: { storeId?: unknown };
  try {
    parsed = JSON.parse(base64UrlDecodeDelegationSegment(payloadSeg)) as {
      storeId?: unknown;
    };
  } catch {
    throw new BlobError('Invalid delegation token payload.');
  }

  if (!parsed.storeId || typeof parsed.storeId !== 'string') {
    throw new BlobError('Delegation token payload is missing `storeId`.');
  }

  return normalizeDelegationStoreId(parsed.storeId);
}

export function parseStoreIdFromPresignedUrl(
  presignedUrlPayload: PresignedUrlPayload,
): string {
  const delegation = presignedUrlPayload.delegationToken;
  return parseStoreIdFromDelegationToken(delegation);
}

/**
 * Strips the optional `store_` prefix from a store id. `BLOB_STORE_ID` (what
 * `vercel env pull` writes) and the `storeId` option are accepted in either
 * `store_<id>` or `<id>` form; downstream consumers (CDN host subdomain,
 * `x-vercel-blob-store-id` header) want the bare form. Case is preserved
 * because the API is case-sensitive on this value.
 */
export function normalizeStoreId(storeId: string): string {
  return storeId.startsWith('store_')
    ? storeId.slice('store_'.length)
    : storeId;
}

/**
 * Resolves credentials in the following priority order:
 * 1. An explicit read-write `token` passed via options.
 * 2. `VERCEL_OIDC_TOKEN` paired with `storeId` option (or `BLOB_STORE_ID`).
 * 3. `BLOB_READ_WRITE_TOKEN` from the environment.
 */
export function resolveBlobAuth(
  options?: BlobCommandOptions & BlobPresignedCommandOptions,
): ResolvedBlobAuth {
  if (options?.presignedUrlPayload) {
    const storeId = parseStoreIdFromDelegationToken(
      options.presignedUrlPayload.delegationToken,
    );
    return { kind: 'presigned', storeId };
  }
  // An explicitly supplied token always wins over OIDC and env-based tokens.
  if (options?.token) {
    const storeId = parseStoreIdFromReadWriteToken(options.token);
    return { kind: 'readWrite', token: options.token, storeId };
  }

  const oidcToken = getVercelOidcToken();
  if (oidcToken) {
    // Try to get storeId from the supplied options
    const manualStoreId = options?.storeId?.trim();
    if (manualStoreId) {
      return {
        kind: 'oidc',
        token: oidcToken,
        storeId: normalizeStoreId(manualStoreId),
      };
    }

    // If not supplied manually, try to get storeId from the environment variable
    const blobStoreId = readEnv('BLOB_STORE_ID');
    if (blobStoreId) {
      return {
        kind: 'oidc',
        token: oidcToken,
        storeId: normalizeStoreId(blobStoreId),
      };
    }
  }

  const readWrite = readEnv('BLOB_READ_WRITE_TOKEN');
  if (readWrite) {
    const storeId = parseStoreIdFromReadWriteToken(readWrite);
    return { kind: 'readWrite', token: readWrite, storeId };
  }

  throw new BlobError(
    'No blob credentials found. Pass a `token` option, set `BLOB_READ_WRITE_TOKEN`, or use `VERCEL_OIDC_TOKEN` with `storeId` or `BLOB_STORE_ID`.',
  );
}

/**
 * Returns the read-write token for signing and callback verification.
 * OIDC-only configuration is not sufficient; pass `token` or set `BLOB_READ_WRITE_TOKEN`.
 */
export function getReadWriteBlobTokenFromOptionsOrEnv(
  options?: Pick<BlobCommandOptions, 'token'>,
): string {
  if (options?.token) {
    return options.token;
  }

  const readWrite = readEnv('BLOB_READ_WRITE_TOKEN');
  if (readWrite) {
    return readWrite;
  }

  throw new BlobError(
    'No read-write token found. Either configure the `BLOB_READ_WRITE_TOKEN` environment variable, or pass a `token` option to your calls.',
  );
}

export class BlobError extends Error {
  constructor(message: string) {
    super(`Vercel Blob: ${message}`);
  }
}

/**
 * Generates a download URL for a blob.
 * The download URL includes a ?download=1 parameter which causes browsers to download
 * the file instead of displaying it inline.
 *
 * @param blobUrl - The URL of the blob to generate a download URL for
 * @returns A string containing the download URL with the download parameter appended
 */
export function getDownloadUrl(blobUrl: string): string {
  const url = new URL(blobUrl);

  url.searchParams.set('download', '1');

  return url.toString();
}

// Extracted from https://github.com/sindresorhus/is-plain-obj/blob/main/index.js
// It's just nearly impossible to use ESM modules with our current setup
export function isPlainObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === null ||
      prototype === Object.prototype ||
      Object.getPrototypeOf(prototype) === null) &&
    !(Symbol.toStringTag in value) &&
    !(Symbol.iterator in value)
  );
}

export const disallowedPathnameCharacters = ['//'];

// Chrome: implemented https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests
// Microsoft Edge: implemented (Chromium)
// Firefox: not implemented, BOO!! https://bugzilla.mozilla.org/show_bug.cgi?id=1469359
// Safari: not implemented, BOO!! https://github.com/WebKit/standards-positions/issues/24
export const supportsRequestStreams = (() => {
  // The next line is mostly for Node.js 16 to avoid trying to do new Request() as it's not supported
  // TODO: Can be removed when Node.js 16 is no more required internally
  if (isNodeProcess()) {
    return true;
  }

  const apiUrl = getApiUrl();

  // Localhost generally doesn't work with HTTP 2 so we can stop here
  if (apiUrl.startsWith('http://localhost')) {
    return false;
  }

  let duplexAccessed = false;

  const hasContentType = new Request(getApiUrl(), {
    body: new ReadableStream(),
    method: 'POST',
    // @ts-expect-error -- TypeScript doesn't yet have duplex but it's in the spec: https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1729
    get duplex() {
      duplexAccessed = true;
      return 'half';
    },
  }).headers.has('Content-Type');

  return duplexAccessed && !hasContentType;
})();

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

  return `${baseUrl || defaultVercelBlobApiUrl}${pathname}`;
}

const TEXT_ENCODER =
  typeof TextEncoder === 'function' ? new TextEncoder() : null;

export function computeBodyLength(body: PutBody): number {
  if (!body) {
    return 0;
  }

  if (typeof body === 'string') {
    if (TEXT_ENCODER) {
      return TEXT_ENCODER.encode(body).byteLength;
    }

    // React Native doesn't have TextEncoder
    return new Blob([body]).size;
  }

  if ('byteLength' in body && typeof body.byteLength === 'number') {
    // handles Uint8Array, ArrayBuffer, Buffer, and ArrayBufferView
    return body.byteLength;
  }

  if ('size' in body && typeof body.size === 'number') {
    // handles Blob and File
    return body.size;
  }

  return 0;
}

export const createChunkTransformStream = (
  chunkSize: number,
  onProgress?: (bytes: number) => void,
): TransformStream<ArrayBuffer | Uint8Array> => {
  let buffer = new Uint8Array(0);

  return new TransformStream<ArrayBuffer, Uint8Array>({
    transform(chunk, controller) {
      // Combine the new chunk with any leftover data
      const newBuffer = new Uint8Array(buffer.length + chunk.byteLength);
      newBuffer.set(buffer);
      newBuffer.set(new Uint8Array(chunk), buffer.length);
      buffer = newBuffer;

      // Output complete chunks
      while (buffer.length >= chunkSize) {
        const newChunk = buffer.slice(0, chunkSize);
        controller.enqueue(newChunk);
        onProgress?.(newChunk.byteLength);
        buffer = buffer.slice(chunkSize);
      }
    },

    flush(controller) {
      // Send any remaining data
      if (buffer.length > 0) {
        controller.enqueue(buffer);
        onProgress?.(buffer.byteLength);
      }
    },
  });
};

export function isReadableStream(value: PutBody): value is ReadableStream {
  return (
    globalThis.ReadableStream && // TODO: Can be removed once Node.js 16 is no more required internally
    value instanceof ReadableStream
  );
}

export function isStream(value: PutBody): value is ReadableStream | Readable {
  if (isReadableStream(value)) {
    return true;
  }

  if (isNodeJsReadableStream(value)) {
    return true;
  }

  return false;
}

export const addPresignedParams = (
  url: string,
  presignedUrlPayload: PresignedUrlPayload,
): string => {
  const urlObj = new URL(url);
  for (const [key, value] of Object.entries(presignedUrlPayload.options)) {
    urlObj.searchParams.set(key, value);
  }
  urlObj.searchParams.set(
    'vercel-blob-delegation',
    presignedUrlPayload.delegationToken,
  );
  urlObj.searchParams.set(
    'vercel-blob-signature',
    presignedUrlPayload.signature,
  );
  return urlObj.toString();
};
