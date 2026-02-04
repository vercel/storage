import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';

/**
 * Result of the head method containing metadata about a blob.
 */
export interface HeadBlobResult {
  /**
   * The size of the blob in bytes.
   */
  size: number;

  /**
   * The date when the blob was uploaded.
   */
  uploadedAt: Date;

  /**
   * The pathname of the blob within the store.
   */
  pathname: string;

  /**
   * The content type of the blob.
   */
  contentType: string;

  /**
   * The content disposition header value.
   */
  contentDisposition: string;

  /**
   * The URL of the blob.
   */
  url: string;

  /**
   * A URL that will cause browsers to download the file instead of displaying it inline.
   */
  downloadUrl: string;

  /**
   * The cache control header value.
   */
  cacheControl: string;

  /**
   * The ETag of the blob. Can be used with `ifMatch` for conditional writes.
   */
  etag?: string;
}

interface HeadBlobApiResponse
  extends Omit<HeadBlobResult, 'uploadedAt' | 'etag'> {
  uploadedAt: string; // when receiving data from our API, uploadedAt is a string
  etag?: string;
}

/**
 * Fetches metadata of a blob object.
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk#get-blob-metadata
 *
 * @param urlOrPathname - Blob url or pathname to lookup.
 * @param options - Additional options for the request.
 */
export async function head(
  urlOrPathname: string,
  options?: BlobCommandOptions,
): Promise<HeadBlobResult> {
  const searchParams = new URLSearchParams({ url: urlOrPathname });

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
    // Only include etag if present (API v12+)
    ...(response.etag ? { etag: response.etag } : {}),
  };
}
