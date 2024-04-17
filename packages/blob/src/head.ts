import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';

export interface HeadBlobResult {
  url: string;
  downloadUrl: string;
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
  const searchParams = new URLSearchParams({ url });

  const response = await requestApi<HeadBlobApiResponse>(
    `?${searchParams.toString()}`,
    // HEAD can't have body as a response, so we use GET
    {
      method: 'GET',
      signal: options?.abortSignal,
    },
    options,
  );

  return {
    url: response.url,
    downloadUrl: response.downloadUrl,
    pathname: response.pathname,
    size: response.size,
    contentType: response.contentType,
    contentDisposition: response.contentDisposition,
    cacheControl: response.cacheControl,
    uploadedAt: new Date(response.uploadedAt),
  };
}
