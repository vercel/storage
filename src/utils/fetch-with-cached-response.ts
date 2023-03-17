export interface CachedResponsePair {
  etag: string;
  response: Response;
}

type FetchOptions = Omit<RequestInit, 'headers'> & { headers?: Headers };

interface ResponseWithCachedResponse extends Response {
  cachedResponse?: Response;
}

export const cache = new Map<string, CachedResponsePair>();

export async function fetchWithCachedResponse(
  url: string,
  options: FetchOptions = {},
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
    });

    if (res.status === 304) {
      res.cachedResponse = cachedResponse.clone();
      return res;
    }

    const newETag = res.headers.get('ETag');
    if (res.ok && newETag)
      cache.set(cacheKey, { etag: newETag, response: res.clone() });
    return res;
  }

  const res = await fetch(url, options);
  const etag = res.headers.get('ETag');
  if (res.ok && etag) cache.set(cacheKey, { etag, response: res.clone() });
  return res;
}
