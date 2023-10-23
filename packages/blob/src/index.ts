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
  BlobUnknownError,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobNotFoundError,
} from './helpers';
export type { PutBlobResult } from './put';

// vercelBlob.put()
export const put = createPutMethod<PutCommandOptions>({
  allowedOptions: ['cacheControlMaxAge', 'addRandomSuffix', 'contentType'],
});

// vercelBlob.del()

type DeleteBlobApiResponse = null;

// del accepts either a single url or an array of urls
// we use function overloads to define the return type accordingly
export async function del(
  url: string[] | string,
  options?: BlobCommandOptions
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

export async function head(
  url: string,
  options?: BlobCommandOptions
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
  limit?: number;
  prefix?: string;
  cursor?: string;
}

export async function list(
  options?: ListCommandOptions
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
  blobResult: ListBlobApiResponseBlob | HeadBlobApiResponse
): ListBlobResultBlob | HeadBlobResult {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}

// vercelBlob.copy()

export { copy, type CopyBlobResult } from './copy';
