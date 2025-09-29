// import { trace } from './tracing';

/**
 * Generate a key for the dedupe cache
 *
 * We currently take only the url and authorization header into account.
 */
function getDedupeCacheKey(url: string, init?: RequestInit): string {
  const h =
    init?.headers instanceof Headers
      ? init.headers
      : new Headers(init?.headers);

  // should be faster than JSON.stringify
  return [
    url,
    init?.method?.toUpperCase() ?? 'GET',
    h.get('Authorization') ?? '',
    h.get('x-edge-config-min-updated-at') ?? '',
  ].join('\n');
}

/**
 * Like `fetch`, but with an http etag cache and deduplication.
 */
export function createEnhancedFetch(): (
  url: string,
  options?: RequestInit,
) => Promise<[Response, Response | null]> {
  const pendingRequests = new Map<string, Promise<Response>>();
  /* not a full http cache, but caches by etags */
  const httpCache = new Map<string, { response: Response; etag: string }>();

  function writeHttpCache(
    /* the original 200 response */
    httpCacheKey: string | null,
    response: Response,
  ): void {
    if (!httpCacheKey) return;
    if (response.status !== 200) return;
    const etag = response.headers.get('ETag');
    if (!etag) return;
    httpCache.set(httpCacheKey, { response: response.clone(), etag });
  }

  /**
   * Gets a cached response for a given request url and response
   *
   * When we receive a 304 with matching etag we return the cached response.
   */
  function readHttpCache(
    httpCacheKey: string | null,
  ): [string, Response] | [null, null] {
    if (!httpCacheKey) return [null, null];
    const cacheEntry = httpCache.get(httpCacheKey);
    if (!cacheEntry) return [null, null];
    return [cacheEntry.etag, cacheEntry.response];
  }

  function addIfNoneMatchHeader(options: RequestInit, etag: string): Headers {
    const h = new Headers(options.headers);
    const existing = h.get('If-None-Match');
    if (!existing) h.set('If-None-Match', etag);
    return h;
  }

  return function enhancedFetch(url, options = {}) {
    const dedupeCacheKey = getDedupeCacheKey(url, options);
    const pendingRequest = pendingRequests.get(dedupeCacheKey);

    // pull out the cached etag and the cached response at once, so we
    // can guarantee the cached response is never removed in between when
    // we fetch and when we receive a response
    const [etag, cachedResponse] = readHttpCache(dedupeCacheKey);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- yep
    if (etag && cachedResponse) {
      options.headers = addIfNoneMatchHeader(options, etag);
    }

    /** Attaches the cached response */
    const attach = (r: Response): [Response, Response | null] =>
      r.status === 304 && cachedResponse
        ? [r, cachedResponse.clone()]
        : [r, null];

    // we need to clone to avoid returning the same request as its body
    // can only be consumed once
    if (pendingRequest) return pendingRequest.then((r) => attach(r.clone()));

    const promise = fetch(url, options)
      .then((res) => {
        writeHttpCache(dedupeCacheKey, res);
        return res;
      })
      .finally(() => {
        pendingRequests.delete(dedupeCacheKey);
      });
    pendingRequests.set(dedupeCacheKey, promise);
    return promise.then(attach);
  };
}
