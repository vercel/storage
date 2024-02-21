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

export function toReadableStream(value: PutBody): ReadableStream<ArrayBuffer> {
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

  let streamValue: Uint8Array | ArrayBuffer;

  if (value instanceof ArrayBuffer) {
    streamValue = value;
  } else if (isNodeJsBufferOrString(value)) {
    streamValue = value.buffer;
  } else {
    streamValue = stringToUint8Array(value);
  }

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

function isNodeJsBufferOrString(input: Buffer | string): input is Buffer {
  return isBuffer(input);
}
