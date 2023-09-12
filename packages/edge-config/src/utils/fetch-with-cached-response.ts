interface CachedResponseEntry {
  etag: string;
  response: string;
  headers: Record<string, string>;
  status: number;
}

type FetchOptions = Omit<RequestInit, 'headers'> & { headers?: Headers };

interface ResponseWithCachedResponse extends Response {
  cachedResponseBody?: unknown;
}

/**
 * A cache of request urls & auth headers and the resulting responses.
 *
 * This cache does not use Response instances as the cache value as reusing
 * responses across requests leads to issues in Cloudflare Workers.
 */
export const cache = new Map<string, CachedResponseEntry>();

/**
 * Creates a new response based on a cache entry
 */
function createResponse(
  cachedResponseEntry: CachedResponseEntry
): ResponseWithCachedResponse {
  return new Response(cachedResponseEntry.response, {
    headers: cachedResponseEntry.headers,
    status: cachedResponseEntry.status,
  });
}

/**
 * Used for bad responses like 500s
 */
function createHandleStaleIfError(cachedResponseEntry: CachedResponseEntry) {
  return function handleStaleIfError(
    response: ResponseWithCachedResponse
  ): ResponseWithCachedResponse {
    switch (response.status) {
      case 500:
      case 502:
      case 503:
      case 504:
        return createResponse(cachedResponseEntry);
      default:
        return response;
    }
  };
}

/**
 * Used on network errors which end up throwing
 */
function createHandleStaleIfErrorException(
  cachedResponseEntry: CachedResponseEntry
) {
  return function handleStaleIfError(): ResponseWithCachedResponse {
    return createResponse(cachedResponseEntry);
  };
}

/**
 * This is similar to fetch, but it also implements ETag semantics, and
 * it implmenets stale-if-error semantics.
 */
export async function fetchWithCachedResponse(
  url: string,
  options: FetchOptions = {}
): Promise<ResponseWithCachedResponse> {
  const { headers: customHeaders = new Headers(), ...customOptions } = options;
  const authHeader = customHeaders.get('Authorization');
  const cacheKey = `${url},${authHeader || ''}`;

  const cachedResponseEntry = cache.get(cacheKey);

  if (cachedResponseEntry) {
    const { etag, response: cachedResponse } = cachedResponseEntry;
    const headers = new Headers(customHeaders);
    headers.set('If-None-Match', etag);

    const res: ResponseWithCachedResponse = await fetch(url, {
      ...customOptions,
      headers,
    }).then(
      createHandleStaleIfError(cachedResponseEntry),
      createHandleStaleIfErrorException(cachedResponseEntry)
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
    });
  }

  return res;
}
