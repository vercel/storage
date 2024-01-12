// eslint-disable-next-line unicorn/prefer-node-protocol -- node:stream does not resolve correctly in browser and edge
import { Readable } from 'stream';
import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import retry from 'async-retry';
import bytes from 'bytes';
import type { PutBlobApiResponse, PutBlobResult, PutBody } from './put';
import {
  BlobServiceNotAvailable,
  getApiUrl,
  validateBlobApiResponse,
} from './helpers';
import { debug } from './debug';

// Most browsers will cap requests at 6 concurrent uploads per domain (Vercel Blob API domain)
// In other environments, we can afford to be more aggressive
const maxConcurrentUploads = typeof window !== 'undefined' ? 6 : 8;

// 5MB is the minimum part size accepted by Vercel Blob, but we set our default part size to 8mb like the aws cli
const partSizeInBytes = 8 * 1024 * 1024;

const maxBytesInMemory = maxConcurrentUploads * partSizeInBytes * 2;

interface CreateMultiPartUploadApiResponse {
  uploadId: string;
  key: string;
}

interface UploadPartApiResponse {
  etag: string;
}

export async function multipartPut(
  pathname: string,
  body: PutBody,
  headers: Record<string, string>,
): Promise<PutBlobResult> {
  debug('mpu: init', 'pathname:', pathname, 'headers:', headers);

  const stream = toReadableStream(body);

  // Step 1: Start multipart upload
  const createMultipartUploadResponse = await createMultiPartUpload(
    pathname,
    headers,
  );

  // Step 2: Upload parts one by one
  const parts = await uploadParts(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    pathname,
    stream,
    headers,
  );

  // Step 3: Complete multipart upload
  const blob = await completeMultiPartUpload(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    pathname,
    parts,
    headers,
  );

  return blob;
}

async function completeMultiPartUpload(
  uploadId: string,
  key: string,
  pathname: string,
  parts: CompletedPart[],
  headers: Record<string, string>,
): Promise<PutBlobResult> {
  const apiUrl = new URL(getApiUrl(`/mpu/${pathname}`));
  try {
    const apiResponse = await fetch(apiUrl, {
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
    });

    await validateBlobApiResponse(apiResponse);

    return (await apiResponse.json()) as PutBlobApiResponse;
  } catch (error: unknown) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new BlobServiceNotAvailable();
    } else {
      throw error;
    }
  }
}

async function createMultiPartUpload(
  pathname: string,
  headers: Record<string, string>,
): Promise<CreateMultiPartUploadApiResponse> {
  debug('mpu: create', 'pathname:', pathname);

  const apiUrl = new URL(getApiUrl(`/mpu/${pathname}`));
  try {
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'x-mpu-action': 'create',
      },
    });

    await validateBlobApiResponse(apiResponse);

    const json = await apiResponse.json();

    debug('mpu: create', json);

    return json as CreateMultiPartUploadApiResponse;
  } catch (error: unknown) {
    console.log(error);
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

interface UploadPart {
  partNumber: number;
  blob: Blob;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

// Can we rewrite this function without new Promise?
function uploadParts(
  uploadId: string,
  key: string,
  pathname: string,
  stream: ReadableStream<ArrayBuffer>,
  headers: Record<string, string>,
): Promise<CompletedPart[]> {
  debug('mpu: upload init', 'key:', key);
  const internalAbortController = new AbortController();

  return new Promise((resolve, reject) => {
    const partsToUpload: UploadPart[] = [];
    const completedParts: CompletedPart[] = [];
    const reader = stream.getReader();
    let activeUploads = 0;
    let reading = false;
    let currentPartNumber = 1;
    // this next variable is used to escape the read loop when an error occurs
    let rejected = false;
    let currentBytesInMemory = 0;
    let doneReading = false;
    let bytesSent = 0;

    // This must be outside the read loop, in case we reach the maxBytesInMemory and
    // we exit the loop but some bytes are still to be sent on the next read invocation.
    let arrayBuffers: ArrayBuffer[] = [];
    let currentPartBytesRead = 0;

    read().catch(cancel);

    async function read(): Promise<void> {
      debug(
        'mpu: upload read start',
        'activeUploads:',
        activeUploads,
        'currentBytesInMemory:',
        `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
        'bytesSent:',
        bytes(bytesSent),
      );

      reading = true;

      while (currentBytesInMemory < maxBytesInMemory && !rejected) {
        try {
          // eslint-disable-next-line no-await-in-loop -- A for loop is fine here.
          const { value, done } = await reader.read();

          if (done) {
            doneReading = true;
            debug('mpu: upload read consumed the whole stream');
            // done is sent when the stream is fully consumed. That's why we're not using the value here.
            if (arrayBuffers.length > 0) {
              partsToUpload.push({
                partNumber: currentPartNumber++,
                blob: new Blob(arrayBuffers, {
                  type: 'application/octet-stream',
                }),
              });

              sendParts();
            }
            reading = false;
            return;
          }

          currentBytesInMemory += value.byteLength;

          // This code ensures that each part will be exactly of `partSizeInBytes` size
          // Otherwise R2 will refuse it. AWS S3 is fine with parts of different sizes.
          let valueOffset = 0;
          while (valueOffset < value.byteLength) {
            const remainingPartSize = partSizeInBytes - currentPartBytesRead;
            const endOffset = Math.min(
              valueOffset + remainingPartSize,
              value.byteLength,
            );

            const chunk = value.slice(valueOffset, endOffset);

            arrayBuffers.push(chunk);
            currentPartBytesRead += chunk.byteLength;
            valueOffset = endOffset;

            if (currentPartBytesRead === partSizeInBytes) {
              partsToUpload.push({
                partNumber: currentPartNumber++,
                blob: new Blob(arrayBuffers, {
                  type: 'application/octet-stream',
                }),
              });

              arrayBuffers = [];
              currentPartBytesRead = 0;
              sendParts();
            }
          }
        } catch (error) {
          cancel(error);
        }
      }

      debug(
        'mpu: upload read end',
        'activeUploads:',
        activeUploads,
        'currentBytesInMemory:',
        `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
        'bytesSent:',
        bytes(bytesSent),
      );

      reading = false;
    }

    async function sendPart(part: UploadPart): Promise<void> {
      activeUploads++;

      debug(
        'mpu: upload send part start',
        'partNumber:',
        part.partNumber,
        'size:',
        part.blob.size,
        'activeUploads:',
        activeUploads,
        'currentBytesInMemory:',
        `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
        'bytesSent:',
        bytes(bytesSent),
      );

      const apiUrl = new URL(getApiUrl(`/mpu/${pathname}`));

      try {
        const apiResponse = await retry(
          async () => {
            const res = await fetch(apiUrl, {
              signal: internalAbortController.signal,
              method: 'POST',
              headers: {
                ...headers,
                'x-mpu-action': 'upload',
                'x-mpu-key': encodeURI(key),
                'x-mpu-upload-id': uploadId,
                'x-mpu-part-number': part.partNumber.toString(),
              },
              body: part.blob as BodyInit,
            });

            if (res.status >= 500) {
              // this will be retried
              throw new BlobServiceNotAvailable();
            }

            return res;
          },
          {
            onRetry: (error) => {
              // eslint-disable-next-line no-console -- Ok for debugging
              console.log('retrying', error.message);
            },
          },
        );

        try {
          await validateBlobApiResponse(apiResponse);
        } catch (error) {
          cancel(error);
          return;
        }

        debug(
          'mpu: upload send part end',
          'partNumber:',
          part.partNumber,
          'activeUploads',
          activeUploads,
          'currentBytesInMemory:',
          `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
          'bytesSent:',
          bytes(bytesSent),
        );

        if (rejected) {
          return;
        }

        const completedPart =
          (await apiResponse.json()) as UploadPartApiResponse;
        completedParts.push({
          partNumber: part.partNumber,
          etag: completedPart.etag,
        });

        currentBytesInMemory -= part.blob.size;
        activeUploads--;
        bytesSent += part.blob.size;

        if (partsToUpload.length > 0) {
          sendParts();
        }

        if (doneReading) {
          if (activeUploads === 0) {
            reader.releaseLock();
            resolve(completedParts);
          }
          return;
        }

        if (!reading) {
          read().catch(cancel);
        }
      } catch (error) {
        cancel(error);
      }
    }

    function sendParts(): void {
      if (rejected) {
        return;
      }

      debug(
        'send parts',
        'activeUploads',
        activeUploads,
        'partsToUpload',
        partsToUpload.length,
      );
      while (activeUploads < maxConcurrentUploads && partsToUpload.length > 0) {
        const partToSend = partsToUpload.shift();
        if (partToSend) {
          void sendPart(partToSend);
        }
      }
    }

    function cancel(error: unknown): void {
      // a previous call already rejected the whole call, ignore
      if (rejected) {
        return;
      }
      rejected = true;
      internalAbortController.abort();
      reader.releaseLock();
      if (
        error instanceof TypeError &&
        (error.message === 'Failed to fetch' ||
          error.message === 'fetch failed')
      ) {
        reject(new BlobServiceNotAvailable());
      } else {
        reject(error);
      }
    }
  });
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
