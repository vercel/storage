import { requestApi } from './api';
import type { CommonCreateBlobOptions, WithUploadProgress } from './helpers';
import { BlobError, isPlainObject } from './helpers';
import type {
  OptimizeImageOptions,
  PutBlobApiResponse,
  PutBlobResult,
  PutBody,
} from './put-helpers';
import {
  addOptimizeImageParams,
  createPutHeaders,
  createPutOptions,
  validateOptimizeImageOptions,
  validateOptimizeImageSourceContentType,
} from './put-helpers';

export interface PutImageCommandOptions
  extends CommonCreateBlobOptions,
    WithUploadProgress {
  /**
   * The desired width of the optimized image in pixels (1-8192).
   */
  width: number;
  /**
   * The desired quality of the optimized image (1-100).
   * @defaultvalue 75
   */
  quality?: number;
  /**
   * The desired output format. The source format is preserved when omitted.
   */
  format?: OptimizeImageOptions['format'];
}

export type PutImageBlobResult = PutBlobResult;

function toPutBlobResult(response: PutBlobApiResponse): PutBlobResult {
  return {
    url: response.url,
    downloadUrl: response.downloadUrl,
    pathname: response.pathname,
    contentType: response.contentType,
    contentDisposition: response.contentDisposition,
    etag: response.etag,
  };
}

/**
 * Optimizes an image through Vercel Image Optimization and stores the
 * optimized output in your store. The source can be the image content itself
 * (string, File, Blob, Buffer or Stream) or a URL instance pointing at a
 * public http(s) image, which is fetched server-side. Only the optimized
 * result is stored. Requires OIDC authentication. Billed as an image
 * transformation plus a regular blob put.
 *
 * @param pathname - The pathname to store the optimized image at, including the extension.
 * @param bodyOrUrl - The image content (string, File, Blob, Buffer or Stream), or a URL instance pointing at the public http(s) source image.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'.
 *   - width - (Required) The desired width of the optimized image in pixels (1-8192).
 *   - quality - (Optional) The desired quality of the optimized image (1-100). Defaults to 75.
 *   - format - (Optional) The desired output format: 'jpeg', 'png', 'webp' or 'avif'. The source format is preserved when omitted.
 *   - addRandomSuffix - (Optional) A boolean specifying whether to add a random suffix to the pathname. It defaults to false.
 *   - allowOverwrite - (Optional) A boolean to allow overwriting blobs. By default an error will be thrown if the destination blob already exists.
 *   - contentType - (Optional) The media type of a body source. Not supported when the source is a URL. By default, it's extracted from the pathname's extension.
 *   - cacheControlMaxAge - (Optional) A number in seconds to configure how long Blobs are cached.
 *   - ifMatch - (Optional) Only perform the operation if the blob's current ETag matches this value. Implies allowOverwrite.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel. Ignored when Vercel OIDC token is available and either process.env.BLOB_STORE_ID or options.storeId is set.
 *   - oidcToken - (Optional) Vercel OIDC token for authentication with `storeId` (or `BLOB_STORE_ID`); overrides `VERCEL_OIDC_TOKEN`.
 *   - storeId - (Optional) Blob store id. Used to override process.env.BLOB_STORE_ID when Vercel OIDC token is available.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 *   - onUploadProgress - (Optional) Callback to track upload progress for body sources: onUploadProgress(\{loaded: number, total: number, percentage: number\})
 * @returns A promise that resolves to the stored blob information, including pathname, contentType, contentDisposition, url, and downloadUrl.
 */
export async function putImage(
  pathname: string,
  bodyOrUrl: PutBody | URL,
  options: PutImageCommandOptions,
): Promise<PutImageBlobResult> {
  const optimizeImage: OptimizeImageOptions = {
    width: options?.width,
    quality: options?.quality,
    format: options?.format,
  };
  validateOptimizeImageOptions(optimizeImage, '');

  if (bodyOrUrl instanceof URL) {
    if (bodyOrUrl.protocol !== 'http:' && bodyOrUrl.protocol !== 'https:') {
      throw new BlobError('the source URL must use the http(s) protocol');
    }

    if (options.contentType) {
      throw new BlobError(
        'contentType is not supported when the source is a URL',
      );
    }

    const putOptions = await createPutOptions({ pathname, options });

    const headers = createPutHeaders(
      ['cacheControlMaxAge', 'addRandomSuffix', 'allowOverwrite', 'ifMatch'],
      putOptions,
    );

    const params = new URLSearchParams({
      pathname,
      url: bodyOrUrl.toString(),
    });
    addOptimizeImageParams(params, optimizeImage);

    const response = await requestApi<PutBlobApiResponse>(
      `/put-from-url?${params.toString()}`,
      {
        method: 'POST',
        headers,
        signal: putOptions.abortSignal,
      },
      putOptions,
    );

    return toPutBlobResult(response);
  }

  if (!bodyOrUrl) {
    throw new BlobError('body is required');
  }

  if (isPlainObject(bodyOrUrl)) {
    throw new BlobError(
      "Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload.",
    );
  }

  const putOptions = await createPutOptions({ pathname, options });

  const headers = createPutHeaders(
    [
      'cacheControlMaxAge',
      'addRandomSuffix',
      'allowOverwrite',
      'contentType',
      'ifMatch',
    ],
    putOptions,
  );

  // The `contentType` option or a Blob/File `type` reveals a non-image
  // source without reading the body; File extends Blob.
  validateOptimizeImageSourceContentType(
    putOptions.contentType ??
      (typeof Blob !== 'undefined' && bodyOrUrl instanceof Blob
        ? bodyOrUrl.type
        : undefined),
    'putImage',
  );

  const params = new URLSearchParams({ pathname });
  addOptimizeImageParams(params, optimizeImage);

  const response = await requestApi<PutBlobApiResponse>(
    `/put-optimized?${params.toString()}`,
    {
      method: 'POST',
      body: bodyOrUrl,
      headers,
      signal: putOptions.abortSignal,
    },
    putOptions,
  );

  return toPutBlobResult(response);
}
