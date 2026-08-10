import type { CommonCreateBlobOptions, WithUploadProgress } from './helpers';
import { BlobError } from './helpers';
import { createPutMethod } from './put';
import { putImageFromUrl } from './put-from-url';
import type {
  OptimizeImageOptions,
  PutBlobResult,
  PutBody,
} from './put-helpers';

export interface PutImageCommandOptions
  extends CommonCreateBlobOptions,
    WithUploadProgress {
  /**
   * How to optimize the image before storing it: desired width in pixels
   * (required, 1-8192), quality (1-100, defaults to 75) and output format
   * (defaults to the source format).
   */
  optimizeImage: OptimizeImageOptions;
}

export type PutImageBlobResult = PutBlobResult;

const putOptimized = createPutMethod<PutImageCommandOptions>({
  allowedOptions: [
    'cacheControlMaxAge',
    'addRandomSuffix',
    'allowOverwrite',
    'contentType',
    'ifMatch',
  ],
});

function isSourceUrl(bodyOrUrl: PutBody): bodyOrUrl is string {
  return typeof bodyOrUrl === 'string' && /^https?:\/\//i.test(bodyOrUrl);
}

/**
 * Optimizes an image through Vercel Image Optimization and stores the
 * optimized output in your store. The source can be the image content itself
 * (string, File, Blob, Buffer or Stream) or a public http(s) URL, which is
 * fetched server-side. Only the optimized result is stored. Requires OIDC
 * authentication. Billed as an image transformation plus a regular blob put.
 *
 * @param pathname - The pathname to store the optimized image at, including the extension.
 * @param bodyOrUrl - The image content (string, File, Blob, Buffer or Stream), or the public http(s) URL of the source image.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'.
 *   - optimizeImage - (Required) Image optimization parameters (\{width: number, quality?: number, format?: 'jpeg' | 'png' | 'webp' | 'avif'\}).
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
  bodyOrUrl: PutBody,
  options: PutImageCommandOptions,
): Promise<PutImageBlobResult> {
  // Without this, an untyped caller omitting optimizeImage would fall through
  // to a regular, unoptimized put.
  if (!options?.optimizeImage) {
    throw new BlobError('optimizeImage is required, see usage');
  }

  if (isSourceUrl(bodyOrUrl)) {
    if (options?.contentType) {
      throw new BlobError(
        'contentType is not supported when the source is a URL',
      );
    }

    return putImageFromUrl(pathname, bodyOrUrl, options);
  }

  return putOptimized(pathname, bodyOrUrl, options);
}
