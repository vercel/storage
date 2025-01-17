// eslint-disable-next-line unicorn/prefer-node-protocol -- node:stream does not resolve correctly in browser and edge
import { Readable } from 'stream';
// eslint-disable-next-line unicorn/prefer-node-protocol -- node:buffer does not resolve correctly in browser and edge
import type { Buffer } from 'buffer';
import isBuffer from 'is-buffer';
import type { PutBody } from '../put-helpers';

export interface PartInput {
  partNumber: number;
  blob: PutBody;
}

export interface Part {
  partNumber: number;
  etag: string;
}

const supportsNewBlobFromArrayBuffer = new Promise<boolean>((resolve) => {
  // React Native doesn't support creating a Blob from an ArrayBuffer, so we feature detect it
  try {
    const helloAsArrayBuffer = new Uint8Array([104, 101, 108, 108, 111]);
    const blob = new Blob([helloAsArrayBuffer]);
    blob
      .text()
      .then((text) => {
        resolve(text === 'hello');
      })
      .catch(() => {
        resolve(false);
      });
  } catch {
    resolve(false);
  }
});

export async function toReadableStream(
  value: PutBody,
): Promise<ReadableStream<ArrayBuffer | Uint8Array>> {
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

  let streamValue: Uint8Array;

  // While ArrayBuffer is valid as a fetch body, when used in a ReadableStream it will fail in Node.js with
  // The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received an instance of ArrayBuffer
  if (value instanceof ArrayBuffer) {
    streamValue = new Uint8Array(value);
  } else if (isNodeJsBuffer(value)) {
    streamValue = value;
  } else {
    // value is a string, we need to convert it to a Uint8Array to get create a stream from it
    streamValue = stringToUint8Array(value as string);
  }

  // This line ensures that even when we get a buffer of 70MB, we'll create a stream out of it so we can have
  // better progress indication during uploads
  if (await supportsNewBlobFromArrayBuffer) {
    return new Blob([streamValue]).stream();
  }

  // from https://github.com/sindresorhus/to-readable-stream/blob/main/index.js
  return new ReadableStream<ArrayBuffer | Uint8Array>({
    start(controller) {
      controller.enqueue(streamValue);
      controller.close();
    },
  });
}

// From https://github.com/sindresorhus/is-stream/
export function isNodeJsReadableStream(value: PutBody): value is Readable {
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

function isNodeJsBuffer(value: PutBody): value is Buffer {
  return isBuffer(value);
}
