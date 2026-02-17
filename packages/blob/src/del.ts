import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';
import { BlobError } from './helpers';

export interface DeleteCommandOptions extends BlobCommandOptions {
  /**
   * Only delete the blob if its current ETag matches this value.
   * Use this for optimistic concurrency control to prevent deleting a blob that has been modified since it was last read.
   * If the ETag doesn't match, a `BlobPreconditionFailedError` will be thrown.
   * Can only be used when deleting a single URL.
   */
  ifMatch?: string;
}

/**
 * Deletes one or multiple blobs from your store.
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk#delete-a-blob
 *
 * @param urlOrPathname - Blob url (or pathname) to delete. You can pass either a single value or an array of values. You can only delete blobs that are located in a store, that your 'BLOB_READ_WRITE_TOKEN' has access to.
 * @param options - Additional options for the request.
 */
export async function del(
  urlOrPathname: string[] | string,
  options?: DeleteCommandOptions,
): Promise<void> {
  const urls = Array.isArray(urlOrPathname) ? urlOrPathname : [urlOrPathname];

  if (options?.ifMatch && urls.length > 1) {
    throw new BlobError('ifMatch can only be used when deleting a single URL.');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (options?.ifMatch) {
    headers['x-if-match'] = options.ifMatch;
  }

  await requestApi(
    '/delete',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ urls }),
      signal: options?.abortSignal,
    },
    options,
  );
}
