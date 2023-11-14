import { Readable } from 'node:stream';
import type { PutBlobResult, PutBody } from './put';

const maxConcurrentUploads = 30;
const partSizeInBytes = 5 * 1024 * 1024;

interface BlobUploadPart {
  id: number;
  blob: Blob;
}

export async function multipartPut(
  body:
    | string
    | Readable // Node.js streams
    | Blob
    | ArrayBuffer
    | ReadableStream // Streams API (= Web streams in Node.js)
    | File,
): Promise<PutBlobResult> {
  const stream = toReadableStream(body);

  return new Promise((resolve, reject) => {
    const partsToSend: BlobUploadPart[] = [];
    const reader = stream.getReader();
    let activeUploads = 0;
    let reading = false;
    let currentPartId = 0;
    let totalBytesSent = 0;
    let totalBytesRead = 0;

    async function read(): Promise<void> {
      reading = true;
      let arrayBuffers: ArrayBuffer[] = [];
      let bytesRead = 0;
      while (partsToSend.length < maxConcurrentUploads * 2) {
        try {
          // eslint-disable-next-line no-await-in-loop -- A for loop is fine here.
          const { value, done } = await reader.read();
          if (done) {
            // done is sent when the stream is fully consumed. That's why we're not using the value here.
            if (arrayBuffers.length > 0) {
              partsToSend.push({
                id: currentPartId++,
                blob: new Blob(arrayBuffers),
              });
              sendParts();
            }
            reading = false;
            return;
          }

          arrayBuffers.push(value);
          bytesRead += value.byteLength;
          totalBytesRead += value.byteLength;

          if (bytesRead >= partSizeInBytes) {
            partsToSend.push({
              id: currentPartId++,
              blob: new Blob(arrayBuffers),
            });
            arrayBuffers = [];
            bytesRead = 0;
            sendParts();
          }
        } catch (error) {
          reject(error);
        }
      }
      reading = false;
    }

    function sendPart(part: BlobUploadPart): void {
      totalBytesSent += part.blob.size;
      activeUploads++;
      fakeRequest(part)
        .then(() => {
          activeUploads--;
          if (partsToSend.length > 0) {
            sendParts();
          } else if (activeUploads === 0) {
            resolve({
              contentDisposition: 'fixme',
              contentType: 'fixme',
              pathname: 'fixme.png',
              url: 'fixme.com/ok.png',
            });
          }

          // Resume reading if we have room for more parts
          if (!reading && partsToSend.length < maxConcurrentUploads * 2) {
            read().catch(reject);
          }
        })
        .catch((error) => {
          reject(error);
        });
    }

    function sendParts(): void {
      while (activeUploads < maxConcurrentUploads && partsToSend.length > 0) {
        const partToSend = partsToSend.shift();
        if (partToSend) {
          sendPart(partToSend);
        }
      }
    }

    read().catch(reject);

    // no need to be here, for testing
    function fakeRequest(blobPart: BlobUploadPart): Promise<unknown> {
      // eslint-disable-next-line no-console -- ok
      console.log(
        `part ${
          blobPart.id
        } - ${new Date().toISOString()} - active: ${activeUploads} - START - ${bytesToSize(
          totalBytesSent,
        )}/${bytesToSize(totalBytesRead)}`,
      );
      return new Promise((resolveInner) => {
        setTimeout(
          function fakeRequestReal() {
            // eslint-disable-next-line no-console -- ok
            console.log(
              `part ${
                blobPart.id
              } - ${new Date().toISOString()} - active: ${activeUploads} - END - ${bytesToSize(
                totalBytesSent,
              )}/${bytesToSize(totalBytesRead)}`,
            );
            resolveInner(true);
          },
          random(20, 1000),
        );
      });
    }
  });
}

// tmp
function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// tmp
function bytesToSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
  return `${Math.round(bytes / Math.pow(1024, i))} ${sizes[i]}`;
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
