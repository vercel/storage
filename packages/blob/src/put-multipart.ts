import { Readable } from 'node:stream';
import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import type { PutBlobApiResponse, PutBlobResult, PutBody } from './put';
import { getApiUrl } from './helpers';

// Most browsers will cap requests at 6 concurrent uploads per domain (Vercel Blob API domain)
const maxConcurrentUploads = 6;

// 5MB is the minimum part size accepted by Vercel Blob
const partSizeInBytes = 5 * 1024 * 1024;

const maxBytesInMemory = maxConcurrentUploads * partSizeInBytes * 2;

interface CreateMultiPartUploadApiResponse extends PutBlobApiResponse {
  uploadId: string;
  key: string;
}

interface UploadPartApiResponse {
  etag: string;
}

interface CompleteMultiPartUploadApiResponse {
  key: string;
}

export async function multipartPut(
  pathname: string,
  body: PutBody,
  baseHeaders: Record<string, string>,
  headersForCreate: Record<string, string>,
): Promise<PutBlobResult> {
  debug('mpu: init', 'pathname:', pathname, 'headers:', headersForCreate);

  const stream = toReadableStream(body);

  // Step 1: Start multipart upload
  const createMultipartUploadResponse = await createMultiPartUpload(pathname, {
    ...baseHeaders,
    ...headersForCreate,
  });

  // Step 2: Upload parts one by one
  const parts = await uploadParts(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    stream,
    baseHeaders,
  );

  // Step 3: Complete multipart upload
  await completeMultiPartUpload(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    parts,
    baseHeaders,
  );

  const blob: PutBlobResult = {
    url: createMultipartUploadResponse.url,
    pathname: createMultipartUploadResponse.pathname,
    contentType: createMultipartUploadResponse.contentType,
    contentDisposition: createMultipartUploadResponse.contentDisposition,
  };

  return blob;
}

async function completeMultiPartUpload(
  uploadId: string,
  key: string,
  parts: CompletedPart[],
  headers: Record<string, string>,
): Promise<CompleteMultiPartUploadApiResponse> {
  const apiUrl = new URL(getApiUrl(`/mpu`));
  apiUrl.searchParams.set('action', 'complete');
  apiUrl.searchParams.set('uploadId', uploadId);
  apiUrl.searchParams.set('key', key);
  const apiResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/json',
    },
    body: JSON.stringify(parts),
  });

  return (await apiResponse.json()) as CompleteMultiPartUploadApiResponse;
}

async function createMultiPartUpload(
  pathname: string,
  headers: Record<string, string>,
): Promise<CreateMultiPartUploadApiResponse> {
  debug('mpu: create', 'pathname:', pathname);

  const apiUrl = new URL(getApiUrl(`/mpu`));
  apiUrl.searchParams.set('action', 'create');
  apiUrl.searchParams.set('pathname', pathname);
  const apiResponse = await fetch(apiUrl, {
    method: 'POST',
    headers,
  });
  const json = await apiResponse.json();

  debug('mpu: create', json);

  return json as CreateMultiPartUploadApiResponse;
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
  stream: ReadableStream<ArrayBuffer>,
  headers: Record<string, string>,
): Promise<CompletedPart[]> {
  debug('mpu: upload init', 'key:', key);

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

    read().catch(cancel);

    async function read(): Promise<void> {
      debug(
        'mpu: upload read start',
        'activeUploads',
        activeUploads,
        'currentBytesInMemory',
        currentBytesInMemory,
      );

      reading = true;
      let arrayBuffers: ArrayBuffer[] = [];
      let currentPartBytesRead = 0;
      while (currentBytesInMemory < maxBytesInMemory && !rejected) {
        try {
          // eslint-disable-next-line no-await-in-loop -- A for loop is fine here.
          const { value, done } = await reader.read();

          if (value) {
            currentBytesInMemory += value.byteLength;
          }

          if (done) {
            doneReading = true;
            debug('mpu: upload read consumed the whole stream');
            // done is sent when the stream is fully consumed. That's why we're not using the value here.
            if (arrayBuffers.length > 0) {
              partsToUpload.push({
                partNumber: currentPartNumber++,
                blob: new Blob(arrayBuffers),
              });
              sendParts();
            }
            reading = false;
            return;
          }

          arrayBuffers.push(value);
          currentPartBytesRead += value.byteLength;

          if (currentPartBytesRead >= partSizeInBytes) {
            partsToUpload.push({
              partNumber: currentPartNumber++,
              blob: new Blob(arrayBuffers),
            });

            arrayBuffers = [];
            currentPartBytesRead = 0;
            sendParts();
          }
        } catch (error) {
          cancel(error);
        }
      }

      debug(
        'mpu: upload read end',
        'activeUploads',
        activeUploads,
        'currentBytesInMemory',
        currentBytesInMemory,
      );

      reading = false;
    }

    async function sendPart(part: UploadPart): Promise<void> {
      debug(
        'mpu: upload send part start',
        'partNumber:',
        part.partNumber,
        'activeUploads',
        activeUploads,
        'currentBytesInMemory:',
        currentBytesInMemory,
      );

      const apiUrl = new URL(getApiUrl(`/${key}`));
      apiUrl.searchParams.set('mpu', '1');
      apiUrl.searchParams.set('action', 'upload');
      apiUrl.searchParams.set('uploadId', uploadId);
      apiUrl.searchParams.set('partNumber', part.partNumber.toString());

      try {
        const apiResponse = await fetch(apiUrl, {
          method: 'PUT',
          headers,
          body: part.blob as BodyInit,
        });

        currentBytesInMemory -= part.blob.size;
        activeUploads--;

        debug(
          'mpu: upload send part end',
          'partNumber:',
          part.partNumber,
          'activeUploads',
          activeUploads,
          'currentBytesInMemory:',
          currentBytesInMemory,
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

        if (partsToUpload.length > 0) {
          sendParts();
        } else if (activeUploads === 0) {
          resolve(completedParts);
        }

        if (doneReading) {
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

      while (activeUploads < maxConcurrentUploads && partsToUpload.length > 0) {
        const partToSend = partsToUpload.shift();
        if (partToSend) {
          activeUploads++;
          void sendPart(partToSend);
        }
      }
    }

    function cancel(error: unknown): void {
      // TODO cancel multipart upload request to edge worker via abort controller
      rejected = true;
      reader.releaseLock();
      reject(error);
    }
  });
}

function toReadableStream(
  value:
    | string
    | Readable // Node.js streams
    | Blob
    | ArrayBuffer
    | ReadableStream // Streams API (= Web streams in Node.js)
    | File,
): ReadableStream<ArrayBuffer> {
  if (value instanceof ReadableStream) {
    return value as ReadableStream<ArrayBuffer>;
  }

  if (value instanceof Blob) {
    return value.stream();
  }

  if (isNodeJsReadableStream(value)) {
    return Readable.toWeb(value) as ReadableStream<ArrayBuffer>;
  }

  const streamValue =
    value instanceof ArrayBuffer ? value : stringToUint8Array(value);

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

function debug(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG?.includes('blob')) {
    // eslint-disable-next-line no-console -- Ok for debugging
    console.debug(`vercel-blob: ${message}`, ...args);
  }
}
