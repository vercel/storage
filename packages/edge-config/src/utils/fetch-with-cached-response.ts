export interface CachedResponsePair {
  etag: string;
  response: string;
  headers: Record<string, string>;
  status: number;
}

type FetchOptions = Omit<RequestInit, 'headers'> & { headers?: Headers };

interface ResponseWithCachedResponse extends Response {
  cachedResponseBody?: unknown;
}

export const cache = new Map<string, CachedResponsePair>();

/**
 * Used for bad responses like 500s
 */
function createHandleStaleIfError(cachedResponsePair: CachedResponsePair) {
  return function handleStaleIfError<T extends ResponseWithCachedResponse>(
    response: T
  ): T | PromiseLike<T> {
    switch (response.status) {
      case 500:
      case 502:
      case 503:
      case 504: {
        const staleResponse = new Response(cachedResponsePair.response, {
          headers: cachedResponsePair.headers,
          status: cachedResponsePair.status,
        }) as T;

        return staleResponse;
      }
      default:
        return response;
    }
  };
}

/**
 * Used on network errors which end up throwing
 */
function createHandleStaleIfErrorException(
  cachedResponsePair: CachedResponsePair
) {
  return function handleStaleIfError<
    T extends ResponseWithCachedResponse
  >(): T {
    const staleResponse = new Response(cachedResponsePair.response, {
      headers: cachedResponsePair.headers,
      status: cachedResponsePair.status,
    }) as T;

    return staleResponse;
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

  const cachedResponsePair = cache.get(cacheKey);

  if (cachedResponsePair) {
    const { etag, response: cachedResponse } = cachedResponsePair;
    const headers = new Headers(customHeaders);
    headers.set('If-None-Match', etag);

    const res: ResponseWithCachedResponse = await fetch(url, {
      ...customOptions,
      headers,
    }).then(
      createHandleStaleIfError(cachedResponsePair),
      createHandleStaleIfErrorException(cachedResponsePair)
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
