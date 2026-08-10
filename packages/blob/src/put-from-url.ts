import { requestApi } from './api';
import type { CommonCreateBlobOptions } from './helpers';
import { BlobError } from './helpers';
import type {
  OptimizeImageOptions,
  PutBlobApiResponse,
  PutBlobResult,
} from './put-helpers';
import {
  addOptimizeImageParams,
  createPutHeaders,
  createPutOptions,
} from './put-helpers';

// `contentType` is omitted because the stored content type always comes from
// the optimizer output, not from the caller.
/** @deprecated Use `putImage` and `PutImageCommandOptions` instead. */
export interface PutFromUrlCommandOptions
  extends Omit<CommonCreateBlobOptions, 'contentType'> {
  /**
   * Optimize the image through Vercel Image Optimization before storing it.
   * Only the optimized output is stored.
   */
  optimizeImage: OptimizeImageOptions;
}

/** @deprecated Use `putImage` and `PutImageBlobResult` instead. */
export type PutFromUrlBlobResult = PutBlobResult;

/**
 * Fetches an image from a public URL, optimizes it through Vercel Image
 * Optimization, and stores the optimized output in your store. The source
 * image is fetched server-side; only the optimized result is stored.
 * Requires OIDC authentication. Billed as an image transformation plus a
 * regular blob put.
 *
 * @param pathname - The pathname to store the optimized image at, including the extension.
 * @param url - The public http(s) URL of the source image.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'.
 *   - optimizeImage - (Required) Image optimization parameters (\{width: number, quality?: number, format?: 'jpeg' | 'png' | 'webp' | 'avif'\}).
 *   - addRandomSuffix - (Optional) A boolean specifying whether to add a random suffix to the pathname. It defaults to false.
 *   - allowOverwrite - (Optional) A boolean to allow overwriting blobs. By default an error will be thrown if the destination blob already exists.
 *   - cacheControlMaxAge - (Optional) A number in seconds to configure how long Blobs are cached.
 *   - ifMatch - (Optional) Only perform the operation if the blob's current ETag matches this value. Implies allowOverwrite.
 *   - oidcToken - (Optional) Vercel OIDC token for authentication with `storeId` (or `BLOB_STORE_ID`); overrides `VERCEL_OIDC_TOKEN`.
 *   - storeId - (Optional) Blob store id. Used to override process.env.BLOB_STORE_ID when Vercel OIDC token is available.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to the stored blob information, including pathname, contentType, contentDisposition, url, and downloadUrl.
 * @deprecated Use `putImage` instead, which accepts either a body or a URL source.
 */
export async function putFromUrl(
  pathname: string,
  url: string,
  options: PutFromUrlCommandOptions,
): Promise<PutFromUrlBlobResult> {
  const putOptions = await createPutOptions({ pathname, options });

  if (!url) {
    throw new BlobError('url is required');
  }

  if (!putOptions.optimizeImage) {
    throw new BlobError('optimizeImage is required, see usage');
  }

  const headers = createPutHeaders(
    ['cacheControlMaxAge', 'addRandomSuffix', 'allowOverwrite', 'ifMatch'],
    putOptions,
  );

  const params = new URLSearchParams({ pathname, url });
  addOptimizeImageParams(params, putOptions.optimizeImage);

  const response = await requestApi<PutBlobApiResponse>(
    `/put-from-url?${params.toString()}`,
    {
      method: 'POST',
      headers,
      signal: putOptions.abortSignal,
    },
    putOptions,
  );

  return {
    url: response.url,
    downloadUrl: response.downloadUrl,
    pathname: response.pathname,
    contentType: response.contentType,
    contentDisposition: response.contentDisposition,
    etag: response.etag,
  };
}
