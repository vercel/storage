import type { PutCommandOptions } from './put';
import { createPutMethod } from './put';

// expose the BlobError types
export {
  BlobAccessError,
  BlobError,
  BlobNotFoundError,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  BlobServiceNotAvailable,
} from './helpers';

// vercelBlob.put()

export type { PutBlobResult, PutCommandOptions } from './put';

/**
 * Uploads a blob into your store from your server.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#upload-a-blob
 *
 * If you want to upload from the browser directly, check out the documentation for client uploads: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#client-uploads
 *
 * @param pathname - The pathname to upload the blob to. This includes the filename.
 * @param body - The contents of your blob. This has to be a supported fetch body type https://developer.mozilla.org/en-US/docs/Web/API/fetch#body.
 * @param options - Additional options like `token` or `contentType`.
 */
export const put = createPutMethod<PutCommandOptions>({
  allowedOptions: ['cacheControlMaxAge', 'addRandomSuffix', 'contentType'],
});

//  vercelBlob.del()

export { del } from './del';

// vercelBlob.head()

export type { HeadBlobResult } from './head';
export { head } from './head';

// vercelBlob.list()

export type {
  ListBlobResultBlob,
  ListBlobResult,
  ListCommandOptions,
  ListFoldedBlobResult,
} from './list';
export { list } from './list';

// vercelBlob.copy()

export type { CopyBlobResult, CopyCommandOptions } from './copy';
export { copy } from './copy';
