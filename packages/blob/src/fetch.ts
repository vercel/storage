import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import type { BlobRequest } from './helpers';
import {
  createChunkTransformStream,
  isStream,
  supportsRequestStreams,
} from './helpers';
import { toReadableStream } from './multipart/helpers';
import type { PutBody } from './put-helpers';
import { debug } from './debug';

export const hasFetch = typeof fetch === 'function';

export const hasFetchWithUploadProgress = hasFetch && supportsRequestStreams;

const CHUNK_SIZE = 64 * 1024;

export const blobFetch: BlobRequest = async ({
  input,
  init,
  onUploadProgress,
}) => {
  debug('using fetch');
  let body: BodyInit | undefined;

  if (init.body) {
    if (onUploadProgress) {
      // We transform the body to a stream here instead of at the call site
      // So that on retries we can reuse the original body, otherwise we would not be able to reuse it
      const stream = await toReadableStream(init.body);

      let loaded = 0;

      const chunkTransformStream = createChunkTransformStream(
        CHUNK_SIZE,
        (newLoaded: number) => {
          loaded += newLoaded;
          onUploadProgress(loaded);
        },
      );

      body = stream.pipeThrough(chunkTransformStream);
    } else {
      body = init.body as BodyInit;
    }
  }

  // Only set duplex option when supported and dealing with a stream body
  const duplex =
    supportsRequestStreams && body && isStream(body as PutBody)
      ? 'half'
      : undefined;

  return fetch(
    input,
    // @ts-expect-error -- Blob and Nodejs Blob are triggering type errors, fine with it
    {
      ...init,
      ...(init.body ? { body } : {}),
      duplex,
    },
  );
};
