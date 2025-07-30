// import { trace } from './tracing';
import {
  compareWeak,
  parseETag,
  stringifyETag,
  type ETag,
} from '@httpland/etag-parser';

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

  return JSON.stringify({ url, authorization: h.get('Authorization') });
}

function safeParseETag(headerValue: string | null): ETag | null {
  if (!headerValue) return null;
  try {
    return parseETag(headerValue);
  } catch {
    return null;
  }
}

export function createEnhancedFetch(): (
  url: string,
  options?: RequestInit,
) => Promise<[Response, Response | null]> {
  const pendingRequests = new Map<string, Promise<Response>>();
  /* not a full http cache, but caches by etags */
  const httpCache = new Map<string, { response: Response; etag: ETag }>();

  function writeHttpCache(
    /* the original 200 response */
    httpCacheKey: string | null,
    response: Response,
  ): void {
    if (!httpCacheKey) return;
    if (response.status !== 200) return;
    const etag = safeParseETag(response.headers.get('ETag'));
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
    /* the 304 response */
    response: Response,
  ): Response | null {
    if (!httpCacheKey) return null;
    if (response.status !== 304) return null;
    const cacheEntry = httpCache.get(httpCacheKey);
    const etag = safeParseETag(response.headers.get('ETag'));
    if (!etag) return null;
    if (!cacheEntry?.etag) return null;
    return compareWeak(etag, cacheEntry.etag)
      ? cacheEntry.response.clone()
      : null;
  }

  function addIfNoneMatchHeader(
    dedupeCacheKey: string,
    options?: RequestInit,
  ): Headers {
    const h = new Headers(options?.headers);

    const cacheEntry = httpCache.get(dedupeCacheKey);
    if (!cacheEntry) return h;

    if (!h.has('If-None-Match')) {
      h.set(
        'If-None-Match',
        stringifyETag({ tag: cacheEntry.etag.tag, weak: true }),
      );
    }

    return h;
  }

  return function enhancedFetch(url, options = {}) {
    const dedupeCacheKey = getDedupeCacheKey(url, options);
    const pendingRequest = pendingRequests.get(dedupeCacheKey);

    // TODO get response clone here so we can guaranteed its never removed
    // in between when we fetch and when we receive a response
    options.headers = addIfNoneMatchHeader(dedupeCacheKey, options);

    /**
     * Attaches the cached response
     */
    const attach = (r: Response): [Response, Response | null] => [
      r,
      readHttpCache(dedupeCacheKey, r),
    ];

    if (pendingRequest) return pendingRequest.then(attach);

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
