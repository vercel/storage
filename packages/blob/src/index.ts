import type { PutCommandOptions } from './put';
import { createPutMethod } from './put';

// expose generic BlobError and download url util
export { BlobError, createDownloadURL } from './helpers';

// expose api BlobErrors
export {
  BlobAccessError,
  BlobNotFoundError,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  BlobServiceNotAvailable,
} from './api';

// vercelBlob.put()

export type { PutBlobResult, PutCommandOptions } from './put';

/**
 * Uploads a blob into your store from your server.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#upload-a-blob
 *
 * If you want to upload from the browser directly, check out the documentation for client uploads: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#client-uploads
 *
 * @param pathname - The pathname to upload the blob to. For file upload this includes the filename. Pathnames that end with a slash are treated as folder creations.
 * @param bodyOrOptions - Either the contents of your blob or the options object. For file uploads this has to be a supported fetch body type https://developer.mozilla.org/en-US/docs/Web/API/fetch#body. For folder creations this is the options object since no body is required.
 * @param options - Additional options like `token` or `contentType` for file uploads. For folder creations this argument can be ommited.
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
