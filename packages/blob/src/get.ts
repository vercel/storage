import { fetch, type Headers } from 'undici';
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
  /**
   * Whether to allow the blob to be served from CDN cache.
   * When false, fetches directly from origin storage.
   * Only effective for private blobs (ignored for public blobs).
   * @defaultValue true
   */
  useCache?: boolean;
  /**
   * Advanced: Additional headers to include in the fetch request.
   * You probably don't need this. The authorization header is automatically set.
   */
  headers?: HeadersInit;
}

/**
 * Result of the get method containing the stream and blob metadata.
 */
export interface GetBlobResult {
  /**
   * The HTTP status code of the response.
   * - 200: Full response with stream and complete metadata.
   * - 304: Not Modified. The blob hasn't changed since the conditional request.
   *   Stream is null, contentType and size are null.
   */
  statusCode: number;

  /**
   * The readable stream from the fetch response.
   * Null when statusCode is 304 (Not Modified).
   */
  stream: ReadableStream<Uint8Array> | null;

  /**
   * The raw headers from the fetch response.
   * Useful for accessing additional response metadata like ETag, x-vercel-* headers, etc.
   */
  headers: Headers;

  /**
   * The blob metadata.
   */
  blob: {
    url: string;
    downloadUrl: string;
    pathname: string;
    /** Null on 304 responses (not included in the response headers). */
    contentType: string | null;
    contentDisposition: string;
    cacheControl: string;
    /** Null on 304 responses (not included in the response headers). */
    size: number | null;
    uploadedAt: Date;
    etag: string;
  };
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
function constructBlobUrl(
  storeId: string,
  pathname: string,
  access: BlobAccessType,
): string {
  return `https://${storeId}.${access}.blob.vercel-storage.com/${pathname}`;
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
 * // Basic usage
 * const { stream, headers, blob } = await get('user123/avatar.png', { access: 'private' });
 *
 * // Bypass cache for private blobs (always fetch fresh from storage)
 * const { stream, headers, blob } = await get('user123/data.json', { access: 'private', useCache: false });
 * ```
 *
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk
 *
 * @param urlOrPathname - The URL or pathname of the blob to fetch.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Determines the access level of the blob.
 *   - useCache - (Optional) When false, fetches directly from origin storage instead of CDN cache. Only effective for private blobs. Defaults to true.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 *   - headers - (Optional, advanced) Additional headers to include in the fetch request. You probably don't need this.
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
    throw new BlobError(
      'access must be "private" or "public", see https://vercel.com/docs/vercel-blob',
    );
  }

  const token = getTokenFromOptionsOrEnv(options);

  let blobUrl: string;
  let pathname: string;
  const access = options.access;

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
    blobUrl = constructBlobUrl(storeId, pathname, access);
  }

  // Fetch the blob content with authentication headers
  const requestHeaders: HeadersInit = {
    ...options.headers,
    authorization: `Bearer ${token}`,
  };

  // Construct fetch URL with optional cache bypass
  let fetchUrl = blobUrl;
  if (options.useCache === false) {
    const url = new URL(blobUrl);
    url.searchParams.set('cache', '0');
    fetchUrl = url.toString();
  }

  const response = await fetch(fetchUrl, {
    method: 'GET',
    headers: requestHeaders,
    signal: options.abortSignal,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    if (response.status === 304) {
      const downloadUrl = new URL(blobUrl);
      downloadUrl.searchParams.set('download', '1');
      const lastModified = response.headers.get('last-modified');
      return {
        statusCode: 304,
        stream: null,
        headers: response.headers,
        blob: {
          url: blobUrl,
          downloadUrl: downloadUrl.toString(),
          pathname,
          contentType: null,
          contentDisposition: response.headers.get('content-disposition') || '',
          cacheControl: response.headers.get('cache-control') || '',
          size: null,
          uploadedAt: lastModified ? new Date(lastModified) : new Date(),
          etag: response.headers.get('etag') || '',
        },
      };
    }

    throw new BlobError(
      `Failed to fetch blob: ${response.status} ${response.statusText}`,
    );
  }

  // Return the stream directly without buffering
  const stream = response.body as ReadableStream;
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
    statusCode: 200,
    stream,
    headers: response.headers,
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
      etag: response.headers.get('etag') || '',
    },
  };
}
