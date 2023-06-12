import type { BodyInit } from 'undici';
// When bundled via a bundler supporting the `browser` field, then
// the `undici` module will be replaced with https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
// for browser contexts. See ./undici-browser.js and ./package.json
import { fetch } from 'undici';
import {
  getApiUrl,
  mapBlobResult,
  BlobAccessError,
  BlobError,
  BlobUnknownError,
} from './helpers';
import {
  type BlobResult,
  type BlobMetadataApi,
  type PutCommandOptions,
  type GenerateClientTokenOptions,
} from '.';

export { type BlobResult } from '.';

export type ClientPutCommandOptions = Omit<PutCommandOptions, 'token'> &
  Pick<GenerateClientTokenOptions, 'onUploadCompleted'> & {
    token: string;
  };

export async function put(
  pathname: string,
  body: string | Blob | ArrayBuffer | FormData | ReadableStream | File,
  options: ClientPutCommandOptions,
): Promise<BlobResult> {
  if (!pathname) {
    throw new BlobError('pathname is required');
  }

  if (!body) {
    throw new BlobError('body is required');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!options || options.access !== 'public') {
    throw new BlobError('access must be "public"');
  }

  if (!options.token) {
    throw new BlobError('"token" is required');
  }
  if (!options.token.startsWith('vercel_blob_client')) {
    throw new BlobError('client upload only supports client tokens');
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.token}`,
  };

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  const blobApiResponse = await fetch(`${getApiUrl()}/${pathname}`, {
    method: 'PUT',
    body: body as BodyInit,
    headers,
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const blobResult = (await blobApiResponse.json()) as BlobMetadataApi;
  return mapBlobResult(blobResult);
}
