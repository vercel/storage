import type { Response } from 'undici';
import { blobFetch, hasFetch, hasFetchWithUploadProgress } from './fetch';
import type { BlobRequest } from './helpers';
import { blobXhr, hasXhr } from './xhr';

export const blobRequest: BlobRequest = async ({
  input,
  init,
  onUploadProgress,
}): Promise<Response> => {
  if (onUploadProgress) {
    if (hasFetchWithUploadProgress) {
      return blobFetch({ input, init, onUploadProgress });
    }

    if (hasXhr) {
      return blobXhr({ input, init, onUploadProgress });
    }
  }

  if (hasFetch) {
    return blobFetch({ input, init });
  }

  if (hasXhr) {
    return blobXhr({ input, init });
  }

  throw new Error('No request implementation available');
};
