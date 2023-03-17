export interface CachedResponsePair {
  etag: string;
  response: Response;
}

type FetchOptions = Omit<RequestInit, 'headers'> & { headers?: Headers };

export const cache = new Map<string, CachedResponsePair>();

export async function fetchWithCache(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const { headers: customHeaders = new Headers(), ...customOptions } = options;
  const authHeader = customHeaders.get('Authorization');
  const cacheKey = `${url},${authHeader || ''}`;

  const cachedResponsePair = cache.get(cacheKey);

  if (cachedResponsePair) {
    const { etag, response: cachedResponse } = cachedResponsePair;
    const headers = new Headers(customHeaders);
    headers.set('If-None-Match', etag);

    const res = await fetch(url, { ...customOptions, headers });

    if (res.status === 304) {
      return cachedResponse.clone();
    }

    const newETag = res.headers.get('ETag');
    if (newETag) {
      const cacheEntry = { etag: newETag, response: res };
      cache.set(cacheKey, cacheEntry);
      return cacheEntry.response.clone();
    }

    return res.clone();
  }

  const res = await fetch(url, options);
  const etag = res.headers.get('ETag');

  if (etag) {
    const cacheEntry = { etag, response: res };
    cache.set(cacheKey, cacheEntry);
    return cacheEntry.response.clone();
  }

  return res.clone();
}
