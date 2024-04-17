import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';

/**
 * Deletes one or multiple blobs from your store.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#delete-a-blob
 *
 * @param url - Blob url or array of blob urls that identify the blobs to be deleted. You can only delete blobs that are located in a store, that your 'BLOB_READ_WRITE_TOKEN' has access to.
 * @param options - Additional options for the request.
 */
export async function del(
  url: string[] | string,
  options?: BlobCommandOptions,
): Promise<void> {
  await requestApi(
    '/delete',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: Array.isArray(url) ? url : [url] }),
      signal: options?.abortSignal,
    },
    options,
  );
}
