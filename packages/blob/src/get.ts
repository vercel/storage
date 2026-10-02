import type { Dispatcher } from 'undici';
import { fetch, getGlobalDispatcher, Headers } from 'undici';
import type { BlobAccessType, BlobCommandOptions } from './helpers';
import { BlobError, constructBlobUrl, isUrl, resolveBlobAuth } from './helpers';

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
   * When false, fetches directly from origin storage, guaranteeing the
   * latest content at the cost of slower reads.
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

type UndiciResponse = Dispatcher.ResponseData;

/**
 * Splits a blob url into the origin and the path exactly as written. `new URL()`
 * would resolve `.` and `..`, which are valid characters in a blob pathname.
 */
function splitBlobUrl(blobUrl: string): { origin: string; path: string } {
  const schemeEnd = blobUrl.indexOf('://');
  const pathStart =
    schemeEnd === -1 ? -1 : blobUrl.indexOf('/', schemeEnd + '://'.length);
  const rawOrigin = pathStart === -1 ? blobUrl : blobUrl.slice(0, pathStart);
  const path = pathStart === -1 ? '/' : blobUrl.slice(pathStart);

  // The parser lowercases the host and drops any userinfo, which the blob
  // vhosts need; it only mangles the path, and that is sliced out above.
  try {
    return { origin: new URL(blobUrl).origin, path };
  } catch {
    return { origin: rawOrigin.toLowerCase(), path };
  }
}

/**
 * Appends a query parameter without going through `new URL()`, which would
 * resolve dot segments in the path along the way.
 */
function appendQueryParam(url: string, param: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${param}`;
}

/**
 * Wraps undici's node stream as a web stream, preserving backpressure. Hand
 * rolled so this module stays free of node builtins.
 */
function toWebStream(body: UndiciResponse['body']): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();

      if (done) {
        controller.close();
        return;
      }

      controller.enqueue(value);
    },
    cancel() {
      body.destroy();
    },
  });
}

interface BlobResponse {
  statusCode: number;
  headers: Headers;
  /** Reads and throws away the body so the connection is released. */
  discard: () => Promise<void>;
  /** The body as a web stream. Null when the response carried no body. */
  toStream: () => ReadableStream<Uint8Array> | null;
}

/**
 * GETs a blob with the path sent exactly as written. Only Node has a
 * dispatcher that allows that; elsewhere this falls back to `fetch`, which
 * parses the url and so resolves `.` and `..` segments on the way out.
 */
async function requestBlob({
  origin,
  path,
  headers,
  signal,
}: {
  origin: string;
  path: string;
  headers: Record<string, string>;
  signal: AbortSignal | undefined;
}): Promise<BlobResponse> {
  // The browser shim returns undefined; the node types do not model that.
  const dispatcher = getGlobalDispatcher() as Dispatcher | undefined;

  if (!dispatcher) {
    const response = await fetch(`${origin}${path}`, {
      method: 'GET',
      headers,
      signal,
    });

    return {
      statusCode: response.status,
      headers: response.headers,
      discard: async () => {
        await response.body?.cancel();
      },
      toStream: () => response.body as ReadableStream<Uint8Array> | null,
    };
  }

  const response = await dispatcher.request({
    origin,
    path,
    method: 'GET',
    headers,
    // `fetch` follows redirects by default; keep that behaviour.
    maxRedirections: 5,
    signal,
  });

  return {
    statusCode: response.statusCode,
    headers: toHeaders(response.headers),
    discard: () => response.body.dump(),
    toStream: () => toWebStream(response.body),
  };
}

/** undici hands back a plain header map; the public API returns `Headers`. */
function toHeaders(raw: UndiciResponse['headers']): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}

/**
 * Extracts the pathname from a blob URL.
 */
function extractPathnameFromUrl(url: string): string {
  const { path } = splitBlobUrl(url);
  const end = [path.indexOf('?'), path.indexOf('#')].filter(
    (index) => index !== -1,
  );

  // Remove leading slash from pathname
  return path.slice(1, end.length > 0 ? Math.min(...end) : undefined);
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
 * // Bypass the CDN cache and read the latest content from origin storage
 * const { stream, headers, blob } = await get('user123/data.json', { access: 'private', useCache: false });
 * ```
 *
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk
 *
 * @param urlOrPathname - The URL or pathname of the blob to fetch.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Determines the access level of the blob.
 *   - useCache - (Optional) When false, bypasses the CDN cache and reads the latest content directly from origin storage. Defaults to true.
 *   - oidcToken - (Optional) Vercel OIDC token for authentication with `storeId` (or `BLOB_STORE_ID`); overrides `VERCEL_OIDC_TOKEN`.
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

  const auth = await resolveBlobAuth(options);

  if (auth.kind === 'presigned') {
    throw new BlobError('Presigned URLs are not supported for the get method');
  }

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
    // undici sends the path as given, so encode here instead of relying on the
    // url parser to do it. Each segment separately, to keep the `/` separators.
    blobUrl = constructBlobUrl(
      auth.storeId,
      pathname.split('/').map(encodeURIComponent).join('/'),
      access,
    );
  }

  // Fetch the blob content with authentication headers. `Headers` lowercases
  // the names, so an override below lands on the same key it replaces.
  const requestHeaders: Record<string, string> = {
    ...(options.ifNoneMatch ? { 'if-none-match': options.ifNoneMatch } : {}),
    authorization: `Bearer ${auth.token}`,
    // low-level escape hatch, applied last to override anything
    ...Object.fromEntries(new Headers(options.headers).entries()),
  };

  // useCache: false bypasses the CDN cache so the content is served
  // directly from origin storage (cache=0 query param). The backend only
  // supports the bypass for private blobs, so it's ignored for public ones.
  const { origin, path } = splitBlobUrl(blobUrl);
  const requestPath =
    options.useCache === false && access === 'private'
      ? appendQueryParam(path, 'cache=0')
      : path;

  const response = await requestBlob({
    origin,
    path: requestPath,
    headers: requestHeaders,
    signal: options.abortSignal,
  });

  const responseHeaders = response.headers;
  // Built from the sliced url rather than `new URL()` so dot segments survive.
  const downloadUrl = appendQueryParam(`${origin}${path}`, 'download=1');

  // Handle 304 Not Modified (a valid conditional response, not an error)
  if (response.statusCode === 304) {
    await response.discard();
    const lastModified = responseHeaders.get('last-modified');
    return {
      statusCode: 304,
      stream: null,
      headers: responseHeaders,
      blob: {
        url: blobUrl,
        downloadUrl,
        pathname,
        contentType: null,
        contentDisposition: responseHeaders.get('content-disposition') || '',
        cacheControl: responseHeaders.get('cache-control') || '',
        size: null,
        uploadedAt: lastModified ? new Date(lastModified) : new Date(),
        etag: responseHeaders.get('etag') || '',
      },
    };
  }

  if (response.statusCode === 404) {
    await response.discard();
    return null;
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    await response.discard();
    throw new BlobError(`Failed to fetch blob: ${response.statusCode}`);
  }

  // Extract metadata from response headers
  const contentLength = responseHeaders.get('content-length');
  const lastModified = responseHeaders.get('last-modified');

  // Returned unbuffered; the caller decides when to read it.
  const stream = response.toStream();
  if (!stream) {
    throw new BlobError('Response body is null');
  }

  return {
    statusCode: 200,
    stream,
    headers: responseHeaders,
    blob: {
      url: blobUrl,
      downloadUrl,
      pathname,
      contentType:
        responseHeaders.get('content-type') || 'application/octet-stream',
      contentDisposition: responseHeaders.get('content-disposition') || '',
      cacheControl: responseHeaders.get('cache-control') || '',
      size: contentLength ? parseInt(contentLength, 10) : 0,
      uploadedAt: lastModified ? new Date(lastModified) : new Date(),
      etag: responseHeaders.get('etag') || '',
    },
  };
}
