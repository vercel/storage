import type { Readable } from 'node:stream';
import type { BodyInit } from 'undici';
// When bundled via a bundler supporting the `browser` field, then
// the `undici` module will be replaced with https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
// for browser contexts. See ./undici-browser.js and ./package.json
import { fetch } from 'undici';
import type { BlobCommandOptions } from './helpers';
import {
  BlobAccessError,
  BlobError,
  BlobUnknownError,
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
} from './helpers';

// expose the BlobError types
export { BlobAccessError, BlobError, BlobUnknownError };

// vercelBlob.put()
export interface PutCommandOptions extends BlobCommandOptions {
  access: 'public';
  contentType?: string;
  addRandomSuffix?: boolean;
  cacheControlMaxAge?: number;
}

export interface PutBlobResult {
  url: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

type PutBlobApiResponse = PutBlobResult;

export async function put(
  pathname: string,
  body:
    | string
    | Readable
    | Blob
    | ArrayBuffer
    | FormData
    | ReadableStream
    | File,
  options: PutCommandOptions
): Promise<PutBlobResult> {
  if (!pathname) {
    throw new BlobError('pathname is required');
  }

  if (!body) {
    throw new BlobError('body is required');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- options are required in Types, but at runtime someone not using Typescript could forget them
  if (!options || options.access !== 'public') {
    throw new BlobError('access must be "public"');
  }

  const token = getTokenFromOptionsOrEnv(options);

  const headers: Record<string, string> = {
    ...getApiVersionHeader(),
    authorization: `Bearer ${token}`,
  };

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  if (options.addRandomSuffix !== undefined) {
    headers['x-add-random-suffix'] = options.addRandomSuffix ? '1' : '0';
  }

  if (options.cacheControlMaxAge !== undefined) {
    headers['x-cache-control-max-age'] = options.cacheControlMaxAge.toString();
  }

  const blobApiResponse = await fetch(getApiUrl(`/${pathname}`), {
    method: 'PUT',
    body: body as BodyInit,
    headers,
    // required in order to stream some body types to Cloudflare
    // currently only supported in Node.js, we may have to feature detect this
    duplex: 'half',
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const blobResult = (await blobApiResponse.json()) as PutBlobApiResponse;

  return blobResult;
}

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

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

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
}

interface HeadBlobApiResponse extends Omit<HeadBlobResult, 'uploadedAt'> {
  uploadedAt: string;
}

export async function head(
  url: string,
  options?: BlobCommandOptions
): Promise<HeadBlobResult | null> {
  const headApiUrl = new URL(getApiUrl());
  headApiUrl.searchParams.set('url', url);

  const blobApiResponse = await fetch(headApiUrl, {
    method: 'GET', // HEAD can't have body as a response, so we use GET
    headers: {
      ...getApiVersionHeader(),
      authorization: `Bearer ${getTokenFromOptionsOrEnv(options)}`,
    },
  });

  if (blobApiResponse.status === 404) {
    return null;
  }

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const headResult = (await blobApiResponse.json()) as HeadBlobApiResponse;

  return mapBlobResult(headResult);
}

// vercelBlob.list()
interface ListBlobResultBlob {
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

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

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
