import { fetch, type Headers } from 'undici';
import type {
  BlobAccessType,
  BlobPresignedCommandOptions,
  PresignedUrlPayload,
} from './helpers';
import { BlobError, resolveBlobAuth } from './helpers';

/**
 * Options for the get method.
 */
export interface GetCommandOptions extends BlobPresignedCommandOptions {
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
   * Only return the full response if the blob's ETag does not match this value.
   * When the ETag matches (blob unchanged), returns statusCode 304 with stream: null.
   * Use this to avoid re-downloading blobs the client already has cached.
   */
  ifNoneMatch?: string;
  /**
   * Advanced: Additional headers to include in the fetch request.
   * You probably don't need this. The authorization header is automatically set.
   */
  headers?: HeadersInit;
}

interface GetBlobResultBlobBase {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentDisposition: string;
  cacheControl: string;
  uploadedAt: Date;
  etag: string;
}

/**
 * Result of the get method containing the stream and blob metadata.
 * Discriminated union on `statusCode`:
 * - `200`: Full response with stream and complete metadata.
 * - `304`: Not Modified. Stream is null, contentType and size are null.
 */
export type GetBlobResult =
  | {
      /** HTTP 200: Full response with stream and complete metadata. */
      statusCode: 200;
      /** The readable stream from the fetch response. */
      stream: ReadableStream<Uint8Array>;
      /** The raw headers from the fetch response. */
      headers: Headers;
      /** The blob metadata. */
      blob: GetBlobResultBlobBase & {
        contentType: string;
        size: number;
      };
    }
  | {
      /** HTTP 304: Not Modified. The blob hasn't changed since the conditional request. */
      statusCode: 304;
      /** Null for 304 responses — no body is returned. */
      stream: null;
      /** The raw headers from the fetch response. */
      headers: Headers;
      /** The blob metadata (contentType and size are null on 304 responses). */
      blob: GetBlobResultBlobBase & {
        contentType: null;
        size: null;
      };
    };

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
 * Constructs the blob URL from storeId and pathname.
 */
function constructBlobUrl(
  storeId: string,
  pathname: string,
  access: BlobAccessType,
  presignedUrlPayload?: PresignedUrlPayload,
): string {
  const baseUrl = `https://${storeId}.${access}.blob.vercel-storage.com/${pathname}`;
  if (presignedUrlPayload) {
    const searchParams = new URLSearchParams();
    searchParams.set(
      'vercel-blob-delegation',
      presignedUrlPayload.delegationToken,
    );
    searchParams.set('vercel-blob-signature', presignedUrlPayload.signature);
    for (const [key, value] of Object.entries(presignedUrlPayload.options)) {
      searchParams.set(key, value);
    }
    return `${baseUrl}?${searchParams.toString()}`;
  }
  return baseUrl;
}

/**
 * Fetches blob content by URL or pathname.
 * - If a URL is provided, fetches the blob directly.
 * - If a pathname is provided, constructs the URL from the resolved store ID (from the read-write token or `BLOB_STORE_ID`).
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
 *   - storeId - (Optional) Store id when using Vercel OIDC token for authentication; overrides `BLOB_STORE_ID`.
 *   - token - (Optional) Read-write token when not using Vercel OIDC token for authentication, or set `BLOB_READ_WRITE_TOKEN`.
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

  const auth = resolveBlobAuth(options);
  const bearerToken = auth.kind === 'presigned' ? undefined : auth.token;

  let blobUrl: string;
  let pathname: string;
  const access = options.access;

  // Check if input is a URL or a pathname
  if (isUrl(urlOrPathname)) {
    blobUrl = urlOrPathname;
    pathname = extractPathnameFromUrl(urlOrPathname);

    try {
      const { hostname } = new URL(blobUrl);
      if (!hostname.endsWith('.blob.vercel-storage.com')) {
        throw new BlobError(
          'Invalid URL: the URL does not point to a Vercel Blob store. Use a pathname instead, see https://vercel.com/docs/vercel-blob',
        );
      }
    } catch (error) {
      if (error instanceof BlobError) throw error;
      throw new BlobError('Invalid URL: unable to parse the provided URL');
    }
  } else {
    if (!auth.storeId) {
      throw new BlobError('Invalid token: unable to extract store ID');
    }
    pathname = urlOrPathname;
    blobUrl = constructBlobUrl(
      auth.storeId,
      pathname,
      access,
      options.presignedUrlPayload,
    );
  }

  // Fetch the blob content with authentication headers
  const requestHeaders: HeadersInit = {
    ...(options.ifNoneMatch ? { 'If-None-Match': options.ifNoneMatch } : {}),
    ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    ...options.headers, // low-level escape hatch, applied last to override anything
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

  // Handle 304 Not Modified (fetch considers this !ok, but it's a valid conditional response)
  if (response.status === 304) {
    const downloadUrlObj = new URL(blobUrl);
    downloadUrlObj.searchParams.set('download', '1');
    const lastModified = response.headers.get('last-modified');
    return {
      statusCode: 304,
      stream: null,
      headers: response.headers,
      blob: {
        url: blobUrl,
        downloadUrl: downloadUrlObj.toString(),
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

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
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
