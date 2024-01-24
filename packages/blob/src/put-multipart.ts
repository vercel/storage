// eslint-disable-next-line unicorn/prefer-node-protocol -- node:stream does not resolve correctly in browser and edge
import { Readable } from 'stream';
import { BlobServiceNotAvailable, requestApi } from './api';
import { debug } from './debug';
import type { PutBlobApiResponse, PutBlobResult, PutBody } from './put';
import type { BlobCommandOptions } from './helpers';
import { uploadAllParts } from './multipart/upload-all-parts';

interface CreateMultiPartUploadApiResponse {
  uploadId: string;
  key: string;
}

export interface UploadPartApiResponse {
  etag: string;
}

export async function multipartPut(
  pathname: string,
  body: PutBody,
  headers: Record<string, string>,
  options: BlobCommandOptions,
): Promise<PutBlobResult> {
  debug('mpu: init', 'pathname:', pathname, 'headers:', headers);

  const stream = toReadableStream(body);

  // Step 1: Start multipart upload
  const createMultipartUploadResponse = await createMultiPartUpload(
    pathname,
    headers,
    options,
  );

  // Step 2: Upload parts one by one
  const parts = await uploadAllParts(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    pathname,
    stream,
    headers,
    options,
  );

  // Step 3: Complete multipart upload
  const blob = await completeMultiPartUpload(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    pathname,
    parts,
    headers,
    options,
  );

  return blob;
}

async function completeMultiPartUpload(
  uploadId: string,
  key: string,
  pathname: string,
  parts: CompletedPart[],
  headers: Record<string, string>,
  options: BlobCommandOptions,
): Promise<PutBlobResult> {
  try {
    const response = await requestApi<PutBlobApiResponse>(
      `/mpu/${pathname}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'x-mpu-action': 'complete',
          'x-mpu-upload-id': uploadId,
          // key can be any utf8 character so we need to encode it as HTTP headers can only be us-ascii
          // https://www.rfc-editor.org/rfc/rfc7230#section-3.2.4
          'x-mpu-key': encodeURI(key),
        },
        body: JSON.stringify(parts),
      },
      options,
    );

    debug('mpu: complete', response);

    return response;
  } catch (error: unknown) {
    if (
      error instanceof TypeError &&
      (error.message === 'Failed to fetch' || error.message === 'fetch failed')
    ) {
      throw new BlobServiceNotAvailable();
    } else {
      throw error;
    }
  }
}

async function createMultiPartUpload(
  pathname: string,
  headers: Record<string, string>,
  options: BlobCommandOptions,
): Promise<CreateMultiPartUploadApiResponse> {
  debug('mpu: create', 'pathname:', pathname);

  try {
    const response = await requestApi<CreateMultiPartUploadApiResponse>(
      `/mpu/${pathname}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'x-mpu-action': 'create',
        },
      },
      options,
    );

    debug('mpu: create', response);

    return response;
  } catch (error: unknown) {
    if (
      error instanceof TypeError &&
      (error.message === 'Failed to fetch' || error.message === 'fetch failed')
    ) {
      throw new BlobServiceNotAvailable();
    } else {
      throw error;
    }
  }
}

export interface UploadPart {
  partNumber: number;
  blob: Blob;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

function toReadableStream(value: PutBody): ReadableStream<ArrayBuffer> {
  // Already a ReadableStream, nothing to do
  if (value instanceof ReadableStream) {
    return value as ReadableStream<ArrayBuffer>;
  }

  // In the case of a Blob or File (which inherits from Blob), we could use .slice() to create pointers
  // to the original data instead of loading data in memory gradually.
  // Here's an explanation on this subject: https://stackoverflow.com/a/24834417
  if (value instanceof Blob) {
    return value.stream();
  }

  if (isNodeJsReadableStream(value)) {
    return Readable.toWeb(value) as ReadableStream<ArrayBuffer>;
  }

  const streamValue =
    value instanceof ArrayBuffer ? value : stringToUint8Array(value);

  // from https://github.com/sindresorhus/to-readable-stream/blob/main/index.js
  return new ReadableStream<ArrayBuffer>({
    start(controller) {
      controller.enqueue(streamValue);
      controller.close();
    },
  });
}

// From https://github.com/sindresorhus/is-stream/
function isNodeJsReadableStream(value: PutBody): value is Readable {
  return (
    typeof value === 'object' &&
    typeof (value as Readable).pipe === 'function' &&
    (value as Readable).readable &&
    typeof (value as Readable)._read === 'function' &&
    // @ts-expect-error _readableState does exists on Readable
    typeof value._readableState === 'object'
  );
}

function stringToUint8Array(s: string): Uint8Array {
  const enc = new TextEncoder();
  return enc.encode(s);
}
