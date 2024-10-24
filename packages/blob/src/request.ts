import type { RequestInit } from 'undici';
import { blobFetch, hasFetch, hasFetchWithUploadProgress } from './fetch';
import { hasXhr, blobXhr } from './xhr';
import type { OnUploadProgressCallback } from './helpers';

export function request(
  init: RequestInit,
  onUploadProgress?: OnUploadProgressCallback,
): Promise<Response> {
  if (onUploadProgress) {
    if (hasFetchWithUploadProgress) {
      return blobFetch({ init, onUploadProgress });
    }

    if (hasXhr) {
      return blobXhr({ init, onUploadProgress });
    }
  }

  if (hasFetch) {
    return blobFetch({ init });
  }

  if (hasXhr) {
    return blobXhr({ init });
  }

  throw new Error('No request implementation available');
}
