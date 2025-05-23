import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';

/**
 * Deletes one or multiple blobs from your store.
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk#delete-a-blob
 *
 * @param urlOrPathname - Blob url (or pathname) to delete. You can pass either a single value or an array of values. You can only delete blobs that are located in a store, that your 'BLOB_READ_WRITE_TOKEN' has access to.
 * @param options - Additional options for the request.
 */
export async function del(
  urlOrPathname: string[] | string,
  options?: BlobCommandOptions,
): Promise<void> {
  await requestApi(
    '/delete',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        urls: Array.isArray(urlOrPathname) ? urlOrPathname : [urlOrPathname],
      }),
      signal: options?.abortSignal,
    },
    options,
  );
}
