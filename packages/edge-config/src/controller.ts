import { waitUntil } from '@vercel/functions';
import type {
  EdgeConfigValue,
  EmbeddedEdgeConfig,
  EdgeConfigFunctionsOptions,
  Connection,
  EdgeConfigClientOptions,
  CacheStatus,
} from './types';
import { ERRORS, isEmptyKey, UnexpectedNetworkError } from './utils';
import { consumeResponseBody } from './utils/consume-response-body';
import { createEnhancedFetch } from './utils/enhanced-fetch';

const DEFAULT_STALE_THRESHOLD = 10_000; // 10 seconds

let timestampOfLatestUpdate: number | undefined;

/**
 * Unified cache entry that stores both the value and existence information
 */
interface CacheEntry<T = EdgeConfigValue> {
  value: T | undefined;
  updatedAt: number;
  digest: string;
  exists: boolean;
}

export function setTimestampOfLatestUpdate(
  timestamp: number | undefined,
): void {
  timestampOfLatestUpdate = timestamp;
}

function parseTs(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const parsed = Number.parseInt(updatedAt, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function getCacheStatus(
  latestUpdate: number | undefined,
  updatedAt: number,
  staleThreshold: number,
): CacheStatus {
  if (latestUpdate === undefined) return 'MISS';
  if (latestUpdate <= updatedAt) return 'HIT';
  // check if it is within the threshold
  if (updatedAt >= latestUpdate - staleThreshold) return 'STALE';
  return 'MISS';
}

export class Controller {
  private edgeConfigCache: (EmbeddedEdgeConfig & { updatedAt: number }) | null =
    null;
  private itemCache = new Map<string, CacheEntry>();
  private connection: Connection;
  private staleThreshold: number;
  private cacheMode: 'no-store' | 'force-cache';
  private enableDevelopmentCache: boolean;

  // create an instance per controller so the caches are isolated
  private enhancedFetch: ReturnType<typeof createEnhancedFetch>;

  constructor(
    connection: Connection,
    options: EdgeConfigClientOptions & { enableDevelopmentCache: boolean },
  ) {
    this.connection = connection;
    this.staleThreshold = options.staleThreshold ?? DEFAULT_STALE_THRESHOLD;
    this.cacheMode = options.cache || 'no-store';
    this.enableDevelopmentCache = options.enableDevelopmentCache;
    this.enhancedFetch = createEnhancedFetch();
  }

  public async get<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T | undefined; digest: string; cache: CacheStatus }> {
    if (this.enableDevelopmentCache || !timestampOfLatestUpdate) {
      return this.fetchItem<T>(
        'GET',
        key,
        timestampOfLatestUpdate,
        localOptions,
      );
    }

    return this.handleCachedRequest<
      T,
      { value: T | undefined; digest: string; cache: CacheStatus }
    >(key, 'GET', localOptions, (cached, cacheStatus) => ({
      value: cached.value,
      digest: cached.digest,
      cache: cacheStatus,
    }));
  }

  /**
   * Updates the edge config cache if the new data is newer
   */
  private updateEdgeConfigCache(
    items: Record<string, EdgeConfigValue>,
    updatedAt: number | null,
    digest: string,
  ): void {
    if (updatedAt) {
      const existing = this.edgeConfigCache;
      if (!existing || existing.updatedAt < updatedAt) {
        this.edgeConfigCache = {
          items,
          updatedAt,
          digest,
        };
      }
    }
  }

  /**
   * Generic handler for cached requests that implements the common cache logic
   */
  private async handleCachedRequest<T extends EdgeConfigValue, R>(
    key: string,
    method: 'GET' | 'HEAD',
    localOptions: EdgeConfigFunctionsOptions | undefined,
    callback: (cached: CacheEntry<T>, cacheStatus: CacheStatus) => R,
  ): Promise<R> {
    // only use the cache if we have a timestamp of the latest update
    if (timestampOfLatestUpdate) {
      const cached = this.getCachedItem<T>(key);

      if (cached) {
        const cacheStatus = getCacheStatus(
          timestampOfLatestUpdate,
          cached.updatedAt,
          this.staleThreshold,
        );

        // HIT
        if (cacheStatus === 'HIT') return callback(cached, 'HIT');

        // we're outdated, but we can still serve the STALE value
        if (cacheStatus === 'STALE') {
          // background refresh
          waitUntil(
            this.fetchItem<T>(
              method,
              key,
              timestampOfLatestUpdate,
              localOptions,
            ).catch(() => null),
          );

          return callback(cached, 'STALE');
        }
      }
    }

    // MISS
    const result = await this.fetchItem<T>(
      method,
      key,
      timestampOfLatestUpdate,
      localOptions,
    );

    // For HEAD requests, we need to return the exists format
    if (method === 'HEAD') {
      return {
        exists: result.value !== undefined,
        digest: result.digest,
        cache: result.cache,
      } as R;
    }

    return {
      value: result.value,
      digest: result.digest,
      cache: result.cache,
    } as R;
  }

  /**
   * Returns an item from the item cache or edge config cache, depending on
   * which value is newer, or null if there is no cached value.
   */
  private getCachedItem<T extends EdgeConfigValue>(
    key: string,
  ): CacheEntry<T> | null {
    const itemCacheEntry = this.itemCache.get(key);
    const cachedConfig = this.edgeConfigCache;

    if (itemCacheEntry && cachedConfig) {
      return itemCacheEntry.updatedAt >= cachedConfig.updatedAt
        ? (itemCacheEntry as CacheEntry<T>)
        : {
            digest: cachedConfig.digest,
            value: cachedConfig.items[key] as T,
            updatedAt: cachedConfig.updatedAt,
            exists: Object.hasOwn(cachedConfig.items, key),
          };
    }

    if (itemCacheEntry && !cachedConfig) {
      return itemCacheEntry as CacheEntry<T>;
    }

    if (!itemCacheEntry && cachedConfig) {
      return {
        value: cachedConfig.items[key] as T,
        updatedAt: cachedConfig.updatedAt,
        digest: cachedConfig.digest,
        exists: Object.hasOwn(cachedConfig.items, key),
      };
    }

    return null;
  }

  private async fetchFullConfig<T extends Record<string, EdgeConfigValue>>(
    minUpdatedAt: number | undefined,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
  }> {
    return this.enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    ).then<{ value: T; digest: string; cache: CacheStatus }>(
      async ([res, cachedRes]) => {
        const digest = res.headers.get('x-edge-config-digest');
        const updatedAt = parseTs(res.headers.get('x-edge-config-updated-at'));

        if (res.status === 401) {
          await consumeResponseBody(res);
          throw new Error(ERRORS.UNAUTHORIZED);
        }

        if (!digest) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);

        if (res.ok || (res.status === 304 && cachedRes)) {
          const value = (await (
            res.status === 304 && cachedRes ? cachedRes : res
          ).json()) as T;

          if (res.status === 304) await consumeResponseBody(res);

          this.updateEdgeConfigCache(value, updatedAt, digest);

          return { value, digest, cache: 'MISS' };
        }

        throw new UnexpectedNetworkError(res);
      },
    );
  }

  /**
   * Loads the item using a GET or check its existence using a HEAD request.
   */
  private async fetchItem<T extends EdgeConfigValue>(
    method: 'GET' | 'HEAD',
    key: string,
    minUpdatedAt: number | undefined,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T | undefined;
    digest: string;
    cache: CacheStatus;
  }> {
    return this.enhancedFetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        method,
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    ).then<{
      value: T | undefined;
      digest: string;
      cache: CacheStatus;
    }>(async ([res, cachedRes]) => {
      const digest = res.headers.get('x-edge-config-digest');
      const updatedAt = parseTs(res.headers.get('x-edge-config-updated-at'));
      if (!digest) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);

      if (res.ok || (res.status === 304 && cachedRes)) {
        // avoid undici memory leaks by consuming response bodies
        if (method === 'HEAD') {
          waitUntil(
            Promise.all([
              consumeResponseBody(res),
              cachedRes ? consumeResponseBody(cachedRes) : null,
            ]),
          );
        } else if (res.status === 304) {
          waitUntil(consumeResponseBody(res));
        }

        let value: T | undefined;
        if (method === 'GET') {
          value = (await (
            res.status === 304 && cachedRes ? cachedRes : res
          ).json()) as T;
        }

        if (updatedAt) {
          const existing = this.itemCache.get(key);
          if (!existing || existing.updatedAt < updatedAt) {
            this.itemCache.set(key, {
              value,
              updatedAt,
              digest,
              exists: method === 'GET' ? value !== undefined : res.ok,
            });
          }
        }
        return { value, digest, cache: 'MISS' };
      }

      await Promise.all([
        consumeResponseBody(res),
        cachedRes ? consumeResponseBody(cachedRes) : null,
      ]);

      if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
      if (res.status === 404) {
        if (digest && updatedAt) {
          const existing = this.itemCache.get(key);
          if (!existing || existing.updatedAt < updatedAt) {
            this.itemCache.set(key, {
              value: undefined,
              updatedAt,
              digest,
              exists: false,
            });
          }
          return { value: undefined, digest, cache: 'MISS' };
        }
        throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      }
      throw new UnexpectedNetworkError(res);
    });
  }

  public async has(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ exists: boolean; digest: string; cache: CacheStatus }> {
    if (this.enableDevelopmentCache || !timestampOfLatestUpdate) {
      return this.fetchItem(
        'HEAD',
        key,
        timestampOfLatestUpdate,
        localOptions,
      ).then((res) => ({
        exists: res.value !== undefined,
        digest: res.digest,
        cache: res.cache,
      }));
    }

    return this.handleCachedRequest<
      EdgeConfigValue,
      { exists: boolean; digest: string; cache: CacheStatus }
    >(key, 'HEAD', localOptions, (cached, cacheStatus) => ({
      exists: cached.exists,
      digest: cached.digest,
      cache: cacheStatus,
    }));
  }

  public async digest(
    localOptions?: Pick<EdgeConfigFunctionsOptions, 'consistentRead'>,
  ): Promise<string> {
    return fetch(
      `${this.connection.baseUrl}/digest?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, timestampOfLatestUpdate),
        cache: this.cacheMode,
      },
    ).then<string>(async (res) => {
      if (res.ok) return res.json() as Promise<string>;
      await consumeResponseBody(res);

      // if (res.cachedResponseBody !== undefined)
      //   return res.cachedResponseBody as string;
      throw new UnexpectedNetworkError(res);
    });
  }

  public async getMultiple<T>(
    keys: (keyof T)[],
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T; digest: string }> {
    if (!Array.isArray(keys)) {
      throw new Error('@vercel/edge-config: keys must be an array');
    }

    // Return early if there are no keys to be read.
    // This is only possible if the digest is not required, or if we have a
    // cached digest (not implemented yet).
    if (!localOptions?.metadata && keys.length === 0) {
      return { value: {} as T, digest: '' };
    }

    const search = new URLSearchParams(
      keys
        .filter((key) => typeof key === 'string' && !isEmptyKey(key))
        .map((key) => ['key', key] as [string, string]),
    ).toString();

    return fetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}&${search}`,
      {
        headers: this.getHeaders(localOptions, timestampOfLatestUpdate),
        cache: this.cacheMode,
      },
    ).then<{ value: T; digest: string }>(async (res) => {
      if (res.ok) {
        const digest = res.headers.get('x-edge-config-digest');
        if (!digest) {
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        }
        const value = (await res.json()) as T;
        return { value, digest };
      }
      await consumeResponseBody(res);

      if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
      // the /items endpoint never returns 404, so if we get a 404
      // it means the edge config itself did not exist
      if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      // if (res.cachedResponseBody !== undefined)
      //   return res.cachedResponseBody as T;
      throw new UnexpectedNetworkError(res);
    });
  }

  public async getAll<T extends Record<string, EdgeConfigValue>>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T; digest: string; cache: CacheStatus }> {
    // if we have the items and they
    if (timestampOfLatestUpdate && this.edgeConfigCache) {
      const cacheStatus = getCacheStatus(
        timestampOfLatestUpdate,
        this.edgeConfigCache.updatedAt,
        this.staleThreshold,
      );

      // HIT
      if (cacheStatus === 'HIT') {
        return {
          value: this.edgeConfigCache.items as T,
          digest: this.edgeConfigCache.digest,
          cache: 'HIT',
        };
      }

      if (cacheStatus === 'STALE') {
        // background refresh
        waitUntil(
          this.fetchFullConfig(timestampOfLatestUpdate, localOptions).catch(),
        );
        return {
          value: this.edgeConfigCache.items as T,
          digest: this.edgeConfigCache.digest,
          cache: 'STALE',
        };
      }
    }

    return this.fetchFullConfig<T>(timestampOfLatestUpdate, localOptions);
  }

  private getHeaders(
    localOptions: EdgeConfigFunctionsOptions | undefined,
    minUpdatedAt: number | undefined,
  ): Headers {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.connection.token}`,
    };
    const localHeaders = new Headers(headers);

    if (localOptions?.consistentRead || minUpdatedAt) {
      localHeaders.set(
        'x-edge-config-min-updated-at',
        `${localOptions?.consistentRead ? Number.MAX_SAFE_INTEGER : minUpdatedAt}`,
      );
    }

    return localHeaders;
  }
}
