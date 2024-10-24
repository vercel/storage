import type { BlobRequest } from './helpers';

export const hasXhr = typeof XMLHttpRequest !== 'undefined';

export const blobXhr: BlobRequest = async ({ init, onUploadProgress }) => {
  return new Response('LOL');
};
