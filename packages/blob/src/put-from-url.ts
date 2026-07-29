import { MAXIMUM_PATHNAME_LENGTH, requestApi } from './api';
import type { CommonCreateBlobOptions } from './helpers';
import { BlobError, disallowedPathnameCharacters } from './helpers';
import type { OptimizeImageOptions, PutBlobResult } from './put-helpers';
import { addOptimizeImageParams } from './put-helpers';

export interface PutFromUrlCommandOptions extends CommonCreateBlobOptions {
  /**
   * Optimize the image through Vercel Image Optimization before storing it.
   * Only the optimized output is stored.
   */
  optimizeImage: OptimizeImageOptions;
}

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
 *   - oidcToken - (Optional) Vercel OIDC token for authentication with `storeId` (or `BLOB_STORE_ID`); overrides `VERCEL_OIDC_TOKEN`.
 *   - storeId - (Optional) Blob store id. Used to override process.env.BLOB_STORE_ID when Vercel OIDC token is available.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to the stored blob information, including pathname, contentType, contentDisposition, url, and downloadUrl.
 */
export async function putFromUrl(
  pathname: string,
  url: string,
  options: PutFromUrlCommandOptions,
): Promise<PutFromUrlBlobResult> {
  if (!options) {
    throw new BlobError('missing options, see usage');
  }

  if (options.access !== 'public' && options.access !== 'private') {
    throw new BlobError(
      'access must be "private" or "public", see https://vercel.com/docs/vercel-blob',
    );
  }

  if (!pathname) {
    throw new BlobError('pathname is required');
  }

  if (pathname.length > MAXIMUM_PATHNAME_LENGTH) {
    throw new BlobError(
      `pathname is too long, maximum length is ${MAXIMUM_PATHNAME_LENGTH}`,
    );
  }

  for (const invalidCharacter of disallowedPathnameCharacters) {
    if (pathname.includes(invalidCharacter)) {
      throw new BlobError(
        `pathname cannot contain "${invalidCharacter}", please encode it if needed`,
      );
    }
  }

  if (!url) {
    throw new BlobError('url is required');
  }

  if (!options.optimizeImage) {
    throw new BlobError('optimizeImage is required, see usage');
  }

  const headers: Record<string, string> = {
    'x-vercel-blob-access': options.access,
  };

  if (options.addRandomSuffix !== undefined) {
    headers['x-add-random-suffix'] = options.addRandomSuffix ? '1' : '0';
  }

  if (options.allowOverwrite !== undefined) {
    headers['x-allow-overwrite'] = options.allowOverwrite ? '1' : '0';
  }

  if (options.cacheControlMaxAge !== undefined) {
    headers['x-cache-control-max-age'] = options.cacheControlMaxAge.toString();
  }

  const params = new URLSearchParams({ pathname, url });
  addOptimizeImageParams(params, options.optimizeImage);

  const response = await requestApi<PutFromUrlBlobResult>(
    `/put-from-url?${params.toString()}`,
    {
      method: 'POST',
      headers,
      signal: options.abortSignal,
    },
    options,
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
