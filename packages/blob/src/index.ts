// When bundled via a bundler supporting the `browser` field, then
// the `undici` module will be replaced with https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
// for browser contexts. See ./undici-browser.js and ./package.json
import { fetch } from 'undici';
import type { BlobCommandOptions } from './helpers';
import {
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
  validateBlobApiResponse,
} from './helpers';
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
} from './helpers';
export type { PutBlobResult } from './put';

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

// vercelBlob.del()

type DeleteBlobApiResponse = null;

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
  const blobApiResponse = await fetch(getApiUrl('/delete'), {
    method: 'POST',
    headers: {
      ...getApiVersionHeader(),
      authorization: `Bearer ${getTokenFromOptionsOrEnv(options)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ urls: Array.isArray(url) ? url : [url] }),
  });

  await validateBlobApiResponse(blobApiResponse);

  (await blobApiResponse.json()) as DeleteBlobApiResponse;
}

// vercelBlob.head()

export interface HeadBlobResult {
  url: string;
  size: number;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  contentDisposition: string;
  cacheControl: string;
}

interface HeadBlobApiResponse extends Omit<HeadBlobResult, 'uploadedAt'> {
  uploadedAt: string; // when receiving data from our API, uploadedAt is a string
}

/**
 * Fetches metadata of a blob object.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#get-blob-metadata
 *
 * @param url - Blob url to lookup.
 * @param options - Additional options for the request.
 */
export async function head(
  url: string,
  options?: BlobCommandOptions,
): Promise<HeadBlobResult> {
  const headApiUrl = new URL(getApiUrl());
  headApiUrl.searchParams.set('url', url);

  const blobApiResponse = await fetch(headApiUrl, {
    method: 'GET', // HEAD can't have body as a response, so we use GET
    headers: {
      ...getApiVersionHeader(),
      authorization: `Bearer ${getTokenFromOptionsOrEnv(options)}`,
    },
  });

  await validateBlobApiResponse(blobApiResponse);

  const headResult = (await blobApiResponse.json()) as HeadBlobApiResponse;

  return mapBlobResult(headResult);
}

// vercelBlob.list()
export interface ListBlobResultBlob {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export interface ListBlobResult {
  blobs: ListBlobResultBlob[];
  cursor?: string;
  hasMore: boolean;
}

interface ListBlobApiResponseBlob
  extends Omit<ListBlobResultBlob, 'uploadedAt'> {
  uploadedAt: string;
}

interface ListBlobApiResponse extends Omit<ListBlobResult, 'blobs'> {
  blobs: ListBlobApiResponseBlob[];
}

export interface ListCommandOptions extends BlobCommandOptions {
  /**
   * The maximum number of blobs to return.
   * @defaultvalue 1000
   */
  limit?: number;
  /**
   * Filters the result to only include blobs located in a certain folder inside your store.
   */
  prefix?: string;
  /**
   * The cursor to use for pagination. Can be obtained from the response of a previous `list` request.
   */
  cursor?: string;
}

/**
 * Fetches a paginated list of blob objects from your store.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#list-blobs
 *
 * @param options - Additional options for the request.
 */
export async function list(
  options?: ListCommandOptions,
): Promise<ListBlobResult> {
  const listApiUrl = new URL(getApiUrl());
  if (options?.limit) {
    listApiUrl.searchParams.set('limit', options.limit.toString());
  }
  if (options?.prefix) {
    listApiUrl.searchParams.set('prefix', options.prefix);
  }
  if (options?.cursor) {
    listApiUrl.searchParams.set('cursor', options.cursor);
  }
  const blobApiResponse = await fetch(listApiUrl, {
    method: 'GET',
    headers: {
      ...getApiVersionHeader(),
      authorization: `Bearer ${getTokenFromOptionsOrEnv(options)}`,
    },
  });

  await validateBlobApiResponse(blobApiResponse);

  const results = (await blobApiResponse.json()) as ListBlobApiResponse;

  return {
    ...results,
    blobs: results.blobs.map(mapBlobResult),
  };
}

function mapBlobResult(blobResult: HeadBlobApiResponse): HeadBlobResult;
function mapBlobResult(blobResult: ListBlobApiResponseBlob): ListBlobResultBlob;
function mapBlobResult(
  blobResult: ListBlobApiResponseBlob | HeadBlobApiResponse,
): ListBlobResultBlob | HeadBlobResult {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}

// vercelBlob.copy()

export { copy, type CopyBlobResult } from './copy';
