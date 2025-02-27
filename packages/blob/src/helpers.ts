// common util interface for blob raw commands, not meant to be used directly
// this is why it's not exported from index/client

import type { Readable } from 'node:stream';
import type { RequestInit, Response } from 'undici';
import { isNodeProcess } from 'is-node-process';
import { isNodeJsReadableStream } from './multipart/helpers';
import type { PutBody } from './put-helpers';

export { bytes } from './bytes';

export interface BlobCommandOptions {
  /**
   * Define your blob API token.
   * @defaultvalue process.env.BLOB_READ_WRITE_TOKEN
   */
  token?: string;
  /**
   * `AbortSignal` to cancel the running request. See https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
   */
  abortSignal?: AbortSignal;
}

// shared interface for put, copy and multipartUpload
export interface CommonCreateBlobOptions extends BlobCommandOptions {
  /**
   * Whether the blob should be publicly accessible.
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

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percentage: number;
}

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

export interface WithUploadProgress {
  /**
   * Callback to track the upload progress. You will receive an object with the following properties:
   * - `loaded`: The number of bytes uploaded
   * - `total`: The total number of bytes to upload
   * - `percentage`: The percentage of the upload that has been completed
   */
  onUploadProgress?: OnUploadProgressCallback;
}

export function getTokenFromOptionsOrEnv(options?: BlobCommandOptions): string {
  if (options?.token) {
    return options.token;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return process.env.BLOB_READ_WRITE_TOKEN;
  }

  throw new BlobError(
    'No token found. Either configure the `BLOB_READ_WRITE_TOKEN` environment variable, or pass a `token` option to your calls.',
  );
}

export class BlobError extends Error {
  constructor(message: string) {
    super(`Vercel Blob: ${message}`);
  }
}

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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ok
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- could be false
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

  return `${baseUrl || 'https://blob.vercel-storage.com'}${pathname}`;
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
      queueMicrotask(() => {
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
      });
    },

    flush(controller) {
      queueMicrotask(() => {
        // Send any remaining data
        if (buffer.length > 0) {
          controller.enqueue(buffer);
          onProgress?.(buffer.byteLength);
        }
      });
    },
  });
};

export function isReadableStream(value: PutBody): value is ReadableStream {
  return (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Not present in Node.js 16
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
