import type { HeadBlobResult } from './head';
import type { BlobAccessType, BlobCommandOptions } from './helpers';
import { BlobError, getTokenFromOptionsOrEnv } from './helpers';

/**
 * Options for the get method.
 */
export interface GetCommandOptions extends BlobCommandOptions {
  /**
   * Whether the blob is publicly accessible or private.
   * - 'public': The blob is publicly accessible via its URL.
   * - 'private': The blob requires authentication to access.
   */
  access: BlobAccessType;
}

/**
 * Result of the get method containing the stream and blob metadata.
 */
export interface GetBlobResult {
  /**
   * The readable stream from the fetch response.
   * This is the raw stream with no automatic buffering, allowing efficient
   * streaming of large files without loading them entirely into memory.
   */
  stream: ReadableStream<Uint8Array>;

  /**
   * The blob metadata object containing url, pathname, contentType, size,
   * downloadUrl, contentDisposition, cacheControl, and uploadedAt.
   */
  blob: HeadBlobResult;
}

/**
 * Checks if the input is a URL (starts with http:// or https://).
 */
function isUrl(urlOrPathname: string): boolean {
  return (
    urlOrPathname.startsWith('http://') || urlOrPathname.startsWith('https://')
  );
}

/**
 * Extracts the pathname from a blob URL.
 */
function extractPathnameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Remove leading slash from pathname
    return parsedUrl.pathname.slice(1);
  } catch {
    return url;
  }
}

/**
 * Extracts the store ID from a blob token.
 * Token format: vercel_blob_rw_<storeId>_<rest>
 */
function getStoreIdFromToken(token: string): string {
  const [, , , storeId = ''] = token.split('_');
  return storeId;
}

/**
 * Constructs the blob URL from storeId and pathname.
 */
function constructBlobUrl(storeId: string, pathname: string): string {
  return `https://${storeId}.public.blob.vercel-storage.com/${pathname}`;
}

/**
 * Fetches blob content by URL or pathname.
 * - If a URL is provided, fetches the blob directly.
 * - If a pathname is provided, constructs the URL from the token's store ID.
 *
 * Returns a stream (no automatic buffering) and blob metadata.
 *
 * @example
 * ```ts
 * const { stream, blob } = await get('user123/love-letter.txt', { access: 'private' });
 * // stream is the ReadableStream from fetch() - no automatic buffering
 * // blob is the metadata object { url, pathname, contentType, size }
 * ```
 *
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk
 *
 * @param urlOrPathname - The URL or pathname of the blob to fetch.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Determines the access level of the blob.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to { stream, blob } or null if not found.
 */
export async function get(
  urlOrPathname: string,
  options: GetCommandOptions,
): Promise<GetBlobResult | null> {
  if (!urlOrPathname) {
    throw new BlobError('url or pathname is required');
  }

  if (!options) {
    throw new BlobError('missing options, see usage');
  }

  if (options.access !== 'public' && options.access !== 'private') {
    throw new BlobError('access must be "public" or "private"');
  }

  const token = getTokenFromOptionsOrEnv(options);

  let blobUrl: string;
  let pathname: string;

  // Check if input is a URL or a pathname
  if (isUrl(urlOrPathname)) {
    blobUrl = urlOrPathname;
    pathname = extractPathnameFromUrl(urlOrPathname);
  } else {
    // Construct the URL from the token's storeId and the pathname
    const storeId = getStoreIdFromToken(token);
    if (!storeId) {
      throw new BlobError('Invalid token: unable to extract store ID');
    }
    pathname = urlOrPathname;
    blobUrl = constructBlobUrl(storeId, pathname);
  }

  // Fetch the blob content with authentication headers
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'x-vercel-blob-access': options.access,
  };

  const response = await fetch(blobUrl, {
    method: 'GET',
    headers,
    signal: options.abortSignal,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new BlobError(
      `Failed to fetch blob: ${response.status} ${response.statusText}`,
    );
  }

  // Return the stream directly without buffering
  const stream = response.body;
  if (!stream) {
    throw new BlobError('Response body is null');
  }

  // Extract metadata from response headers
  const contentLength = response.headers.get('content-length');
  const lastModified = response.headers.get('last-modified');

  // Build download URL by adding download=1 query param
  const downloadUrl = new URL(blobUrl);
  downloadUrl.searchParams.set('download', '1');

  return {
    stream,
    blob: {
      url: blobUrl,
      downloadUrl: downloadUrl.toString(),
      pathname,
      contentType:
        response.headers.get('content-type') || 'application/octet-stream',
      contentDisposition: response.headers.get('content-disposition') || '',
      cacheControl: response.headers.get('cache-control') || '',
      size: contentLength ? parseInt(contentLength, 10) : 0,
      uploadedAt: lastModified ? new Date(lastModified) : new Date(),
    },
  };
}
