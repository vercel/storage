import { fetch } from 'undici';
import type { BlobCommandOptions } from './helpers';
import {
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
  validateBlobApiResponse,
} from './helpers';

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

function mapBlobResult(blobResult: HeadBlobApiResponse): HeadBlobResult;

function mapBlobResult(blobResult: HeadBlobApiResponse): HeadBlobResult {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}
