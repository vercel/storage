import { trace } from './tracing';

interface CachedResponseEntry {
  etag: string;
  response: string;
  headers: Record<string, string>;
  status: number;
  time: number;
}

type FetchOptions = Omit<RequestInit, 'headers'> & { headers?: Headers };

interface ResponseWithCachedResponse extends Response {
  cachedResponseBody?: unknown;
}

/**
 * Creates a new response based on a cache entry
 */
function createResponse(
  cachedResponseEntry: CachedResponseEntry,
): ResponseWithCachedResponse {
  return new Response(cachedResponseEntry.response, {
    headers: {
      ...cachedResponseEntry.headers,
      Age: String(
        // age header may not be 0 when serving stale content, must be >= 1
        Math.max(1, Math.floor((Date.now() - cachedResponseEntry.time) / 1000)),
      ),
    },
    status: cachedResponseEntry.status,
  });
}

/**
 * Used for bad responses like 500s
 */
function createHandleStaleIfError(
  cachedResponseEntry: CachedResponseEntry,
  staleIfError: number | null,
) {
  return function handleStaleIfError(
    response: ResponseWithCachedResponse,
  ): ResponseWithCachedResponse {
    switch (response.status) {
      case 500:
      case 502:
      case 503:
      case 504:
        return typeof staleIfError === 'number' &&
          cachedResponseEntry.time < Date.now() + staleIfError * 1000
          ? createResponse(cachedResponseEntry)
          : response;
      default:
        return response;
    }
  };
}

/**
 * Used on network errors which end up throwing
 */
function createHandleStaleIfErrorException(
  cachedResponseEntry: CachedResponseEntry,
  staleIfError: number | null,
) {
  return function handleStaleIfError(
    reason: unknown,
  ): ResponseWithCachedResponse {
    if (
      typeof staleIfError === 'number' &&
      cachedResponseEntry.time < Date.now() + staleIfError * 1000
    ) {
      return createResponse(cachedResponseEntry);
    }
    throw reason;
  };
}

/**
 * A cache of request urls & auth headers and the resulting responses.
 *
 * This cache does not use Response instances as the cache value as reusing
 * responses across requests leads to issues in Cloudflare Workers.
 */
export const cache = new Map<string, CachedResponseEntry>();

function extractStaleIfError(cacheControlHeader: string | null): number | null {
  if (!cacheControlHeader) return null;
  const matched = /stale-if-error=(?<staleIfError>\d+)/i.exec(
    cacheControlHeader,
  );
  return matched?.groups ? Number(matched.groups.staleIfError) : null;
}

/**
 * This is similar to fetch, but it also implements ETag semantics, and
 * it implmenets stale-if-error semantics.
 */
export const fetchWithCachedResponse = trace(
  async function fetchWithCachedResponse(
    url: string,
    options: FetchOptions = {},
  ): Promise<ResponseWithCachedResponse> {
    const { headers: customHeaders = new Headers(), ...customOptions } =
      options;
    const authHeader = customHeaders.get('Authorization');
    const cacheKey = `${url},${authHeader || ''}`;

    const cachedResponseEntry = cache.get(cacheKey);

    if (cachedResponseEntry) {
      const { etag, response: cachedResponse } = cachedResponseEntry;
      const headers = new Headers(customHeaders);
      headers.set('If-None-Match', etag);

      const staleIfError = extractStaleIfError(headers.get('Cache-Control'));

      const res: ResponseWithCachedResponse = await fetch(url, {
        ...customOptions,
        headers,
      }).then(
        createHandleStaleIfError(cachedResponseEntry, staleIfError),
        createHandleStaleIfErrorException(cachedResponseEntry, staleIfError),
      );

      if (res.status === 304) {
        res.cachedResponseBody = JSON.parse(cachedResponse);
        return res;
      }

      const newETag = res.headers.get('ETag');
      if (res.ok && newETag)
        cache.set(cacheKey, {
          etag: newETag,
          response: await res.clone().text(),
          headers: Object.fromEntries(res.headers.entries()),
          status: res.status,
          time: Date.now(),
        });
      return res;
    }

    const res = await fetch(url, options);
    const etag = res.headers.get('ETag');
    if (res.ok && etag) {
      cache.set(cacheKey, {
        etag,
        response: await res.clone().text(),
        headers: Object.fromEntries(res.headers.entries()),
        status: res.status,
        time: Date.now(),
      });
    }

    return res;
  },
  {
    name: 'fetchWithCachedResponse',
    attributesSuccess(result) {
      return {
        status: result.status,
      };
    },
  },
);
