import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import type { BlobRequest } from './helpers';
import {
  computeBodyLength,
  createChunkTransformStream,
  isStream,
  supportsRequestStreams,
} from './helpers';
import { toReadableStream } from './multipart/helpers';
import type { PutBody } from './put-helpers';

export const hasFetch =
  typeof fetch === 'function' &&
  typeof Request === 'function' &&
  typeof Response === 'function';

export const hasFetchWithUploadProgress = hasFetch && supportsRequestStreams;

const CHUNK_SIZE = 64 * 1024;

export const blobFetch: BlobRequest = async ({
  input,
  init,
  onUploadProgress,
}) => {
  let body: BodyInit | undefined;
  if (init.body) {
    if (onUploadProgress) {
      const bodyLength = computeBodyLength(init.body);

      // We transform the body to a stream here instead of at the call site
      // So that on retries we can reuse the original body, otherwise we would not be able to reuse it
      const stream = await toReadableStream(init.body as PutBody);

      let loaded = 0;

      const chunkTransformStream = createChunkTransformStream(
        CHUNK_SIZE,
        (newLoaded: number) => {
          loaded += newLoaded;
          const total = bodyLength || loaded;
          const percentage = Number(((loaded / total) * 100).toFixed(2));

          // Leave percentage 100 for the end of request
          if (percentage === 100) {
            return;
          }

          onUploadProgress({
            loaded,
            // When passing a stream to put(), we have no way to know the total size of the body.
            // Instead of defining total as total?: number we decided to set the total to the currently
            // loaded number. This is not inaccurate and way more practical for DX.
            // Passing down a stream to put() is very rare
            total,
            percentage,
          });
        },
      );

      body = stream.pipeThrough(chunkTransformStream);
    } else {
      body = init.body;
    }
  }

  // Only set duplex option when supported and dealing with a stream body
  const duplex =
    supportsRequestStreams && body && isStream(body as PutBody)
      ? 'half'
      : undefined;

  return fetch(input, {
    ...init,
    ...(init.body ? { body } : {}),
    duplex,
  });
};
