import { waitUntil } from '@vercel/functions';
import { name as sdkName, version as sdkVersion } from '../package.json';
import type {
  EdgeConfigValue,
  EmbeddedEdgeConfig,
  EdgeConfigFunctionsOptions,
  Connection,
  EdgeConfigClientOptions,
  CacheStatus,
  EdgeConfigItems,
} from './types';
import { ERRORS, isEmptyKey, pick, UnexpectedNetworkError } from './utils';
import { consumeResponseBody } from './utils/consume-response-body';
import { createEnhancedFetch } from './utils/fetch-with-cached-response';
import { readLocalEdgeConfig } from './utils/mockable-import';

const DEFAULT_STALE_THRESHOLD = 10; // 10 seconds
// const DEFAULT_STALE_IF_ERROR = 604800; // one week in seconds

const privateEdgeConfigSymbol = Symbol.for('privateEdgeConfig');

function after(fn: () => Promise<unknown>): void {
  waitUntil(
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    }).then(() => fn()),
  );
}

/**
 * Will return an embedded Edge Config object from memory,
 * but only when the `privateEdgeConfigSymbol` is in global scope.
 */
function getUpdatedAt(connection: Connection): number | null {
  const privateEdgeConfig = Reflect.get(globalThis, privateEdgeConfigSymbol) as
    | { getUpdatedAt: (id: string) => number | null }
    | undefined;

  return typeof privateEdgeConfig === 'object' &&
    typeof privateEdgeConfig.getUpdatedAt === 'function'
    ? privateEdgeConfig.getUpdatedAt(connection.id)
    : null;
}

/**
 * Unified cache entry that stores both the value and existence information
 */
interface CacheEntry<T = EdgeConfigValue> {
  value: T | undefined;
  updatedAt: number;
  digest: string;
  exists: boolean;
}

function parseTs(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const parsed = Number.parseInt(updatedAt, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function getCacheStatus(
  /** Timestamp of the latest update to Edge Config */
  latestUpdate: number | null,
  /** Timestamp of the cache value we are looking at */
  updatedAt: number,
  /** Maximum propagation delay we are willing to tolerate. After this we will fetch fresh data. */
  maxStale: number,
): CacheStatus {
  if (latestUpdate === null) return 'MISS';
  if (latestUpdate <= updatedAt) return 'HIT';

  // Our cached value is outdated (updatedAt < latestUpdate)
  // Check if the latest update happened within the maxStale threshold
  const now = Date.now();
  const maxStaleMs = maxStale * 1000;

  // If the latest update was within the maxStale window, we can serve STALE content
  // (meaning we can serve the cached value while refreshing in background)
  //
  // but this is problematic if we hit a new instance which will have a different
  // very old inlined edge config
  if (now - latestUpdate <= maxStaleMs) return 'STALE';

  // The latest update was too long ago, we need to fetch fresh data
  return 'MISS';
}

export class Controller {
  private edgeConfigCache: EmbeddedEdgeConfig | null = null;
  private itemCache = new Map<string, CacheEntry>();
  private connection: Connection;
  private maxStale: number;
  private cacheMode: 'no-store' | 'force-cache';
  private enableDevelopmentCache: boolean;
  private preloaded: 'init' | 'loading' | 'loaded' = 'init';

  // create an instance per controller so the caches are isolated
  private enhancedFetch: ReturnType<typeof createEnhancedFetch>;

  constructor(
    connection: Connection,
    options: EdgeConfigClientOptions & { enableDevelopmentCache: boolean },
  ) {
    this.connection = connection;
    this.maxStale = options.maxStale ?? DEFAULT_STALE_THRESHOLD;
    this.cacheMode = options.cache || 'no-store';
    this.enableDevelopmentCache = options.enableDevelopmentCache;
    this.enhancedFetch = createEnhancedFetch();
  }

  private async preload(): Promise<void> {
    // if (this.preloaded !== 'init') return;
    if (this.connection.type !== 'vercel') return;
    // the folder won't exist in development, only when deployed
    // if (process.env.NODE_ENV === 'development') return;

    this.preloaded = 'loading';

    try {
      const mod = await readLocalEdgeConfig<{ default: EmbeddedEdgeConfig }>(
        this.connection.id,
      );

      console.log('read', mod.default);

      const hasNewerEntry =
        this.edgeConfigCache &&
        this.edgeConfigCache.updatedAt > mod.default.updatedAt;

      // skip updating the local cache if there is a newer cache entry already
      if (hasNewerEntry) return;

      this.edgeConfigCache = mod.default;
    } catch (e) {
      console.log('caught', e);
      /* do nothing */
    } finally {
      this.preloaded = 'loaded';
    }
  }

  public async get<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T | undefined;
    digest: string;
    cache: CacheStatus;
    exists: boolean;
    updatedAt: number;
  }> {
    // hold a reference to the timestamp to avoid race conditions
    // const ts = getUpdatedAt(this.connection);
    // if (this.enableDevelopmentCache || !ts) {
    //   return this.fetchItem<T>('GET', key, ts, localOptions, true);
    // }

    const ts = 1754511966797;

    await this.preload();

    const cached = this.readCache<T>(key, 'GET', ts, localOptions);
    if (cached) return cached;

    return this.fetchItem<T>('GET', key, ts, localOptions, true);
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
   * Checks the cache and kicks off a background refresh if needed.
   */
  private readCache<T extends EdgeConfigValue>(
    key: string,
    method: 'GET' | 'HEAD',
    timestamp: number | undefined,
    localOptions: EdgeConfigFunctionsOptions | undefined,
  ): {
    value: T | undefined;
    digest: string;
    cache: CacheStatus;
    exists: boolean;
    updatedAt: number;
  } | null {
    // only use the cache if we have a timestamp of the latest update
    if (timestamp) {
      const cached = this.getCachedItem<T>(key, method);

      // console.log('cached', cached);

      if (cached) {
        const cacheStatus = getCacheStatus(
          timestamp,
          cached.updatedAt,
          this.maxStale,
        );

        // console.log('cacheStatus', cacheStatus, timestamp, cached.updatedAt);

        // HIT
        if (cacheStatus === 'HIT') return { ...cached, cache: 'HIT' };

        // we're outdated, but we can still serve the STALE value
        if (cacheStatus === 'STALE') {
          // background refresh
          after(() =>
            this.fetchItem<T>(
              method,
              key,
              timestamp,
              localOptions,
              false,
            ).catch(),
          );

          return { ...cached, cache: 'STALE' };
        }
      }
    }

    // MISS
    return null;
  }

  /**
   * Returns an item from the item cache or edge config cache, depending on
   * which value is newer, or null if there is no cached value.
   */
  private getCachedItem<T extends EdgeConfigValue>(
    key: string,
    method: 'GET' | 'HEAD',
  ): CacheEntry<T> | null {
    const item = this.itemCache.get(key);
    // treat cache entries where we don't know that they exist, but we don't
    // know their value yet as a MISS when we are interested in the value
    const itemCacheEntry =
      method === 'GET' && item?.exists && item.value === undefined
        ? undefined
        : item;
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
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    return this.enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    ).then<{ value: T; digest: string; cache: CacheStatus; updatedAt: number }>(
      async ([res, cachedRes]) => {
        // on 304s we currently don't get the cached headers back from proxy,
        // so we need to check the original response headers
        const digest = (cachedRes ?? res).headers.get('x-edge-config-digest');
        const updatedAt = parseTs(
          (cachedRes ?? res).headers.get('x-edge-config-updated-at'),
        );

        if (res.status === 500) throw new UnexpectedNetworkError(res);

        if (!updatedAt || !digest) {
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        }

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

          return { value, digest, cache: 'MISS', updatedAt };
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
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
    staleIfError?: boolean,
  ): Promise<{
    value: T | undefined;
    digest: string;
    cache: CacheStatus;
    exists: boolean;
    updatedAt: number;
  }> {
    return this.enhancedFetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        method,
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    ).then<
      {
        value: T | undefined;
        digest: string;
        cache: CacheStatus;
        exists: boolean;
        updatedAt: number;
      },
      {
        value: T | undefined;
        digest: string;
        cache: CacheStatus;
        exists: boolean;
        updatedAt: number;
      }
    >(
      async ([res, cachedRes]) => {
        // on 304s we currently don't get the cached headers back from proxy,
        // so we need to check the original response headers
        const digest = (cachedRes || res).headers.get('x-edge-config-digest');
        const updatedAt = parseTs(
          (cachedRes || res).headers.get('x-edge-config-updated-at'),
        );

        if (
          res.status === 500 ||
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504
        ) {
          if (staleIfError) {
            const cached = this.getCachedItem<T>(key, method);
            if (cached) return { ...cached, cache: 'STALE' };
          }

          throw new UnexpectedNetworkError(res);
        }

        if (!digest || !updatedAt)
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);

        if (res.ok || (res.status === 304 && cachedRes)) {
          // avoid undici memory leaks by consuming response bodies
          if (method === 'HEAD') {
            after(() =>
              Promise.all([
                consumeResponseBody(res),
                cachedRes ? consumeResponseBody(cachedRes) : null,
              ]),
            );
          } else if (res.status === 304) {
            after(() => consumeResponseBody(res));
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
                exists:
                  method === 'GET' ? value !== undefined : res.status !== 404,
              });
            }
          }
          return {
            value,
            digest,
            cache: 'MISS',
            exists: res.status !== 404,
            updatedAt,
          };
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
            return {
              value: undefined,
              digest,
              cache: 'MISS',
              exists: false,
              updatedAt,
            };
          }
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        }
        throw new UnexpectedNetworkError(res);
      },
      (reason) => {
        // catch when the fetch call itself throws an error, and handle similar
        // to receiving a 5xx response
        if (staleIfError) {
          const cached = this.getCachedItem<T>(key, method);
          if (cached) return Promise.resolve({ ...cached, cache: 'STALE' });
        }
        throw reason;
      },
    );
  }

  public async has(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ exists: boolean; digest: string; cache: CacheStatus }> {
    const ts = getUpdatedAt(this.connection);
    if (this.enableDevelopmentCache || !ts) {
      return this.fetchItem('HEAD', key, ts, localOptions, true);
    }

    await this.preload();

    const cached = this.readCache<EdgeConfigValue>(
      key,
      'HEAD',
      ts,
      localOptions,
    );
    if (cached) return cached;

    return this.fetchItem('HEAD', key, ts, localOptions, true);
  }

  public async digest(
    localOptions?: Pick<EdgeConfigFunctionsOptions, 'consistentRead'>,
  ): Promise<string> {
    const ts = getUpdatedAt(this.connection);
    return fetch(
      `${this.connection.baseUrl}/digest?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, ts),
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

  public async mget<T extends EdgeConfigItems>(
    keys: string[],
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    const ts = getUpdatedAt(this.connection);
    if (!Array.isArray(keys)) {
      throw new Error('@vercel/edge-config: keys must be an array');
    }

    const filteredKeys = keys.filter(
      (key) => typeof key === 'string' && !isEmptyKey(key),
    );

    // Return early if there are no keys to be read.
    // This is only possible if the digest is not required, or if we have a
    // cached digest (not implemented yet).
    if (!localOptions?.metadata && filteredKeys.length === 0) {
      return {
        value: {} as T,
        digest: '',
        cache: 'HIT',
        updatedAt: -1,
      };
    }

    await this.preload();

    const items = filteredKeys.map((key) => this.getCachedItem(key, 'GET'));
    const firstItem = items[0];

    // check if the item cache is consistent and has all the requested items
    const canUseItemCache =
      firstItem &&
      items.every(
        (item) =>
          item?.exists &&
          item.value !== undefined &&
          // ensure we only use the item cache if all items have the same updatedAt
          item.updatedAt === firstItem.updatedAt,
      );

    // if the item cache is consistent and newer than the edge config cache,
    // we can use it to serve the request
    if (
      canUseItemCache &&
      (!this.edgeConfigCache ||
        this.edgeConfigCache.updatedAt < firstItem.updatedAt)
    ) {
      const cacheStatus = getCacheStatus(
        ts,
        firstItem.updatedAt,
        this.maxStale,
      );

      if (cacheStatus === 'HIT' || cacheStatus === 'STALE') {
        if (cacheStatus === 'STALE') {
          // TODO refresh individual items only?
          after(() => this.fetchFullConfig(ts, localOptions).catch());
        }

        return {
          value: filteredKeys.reduce<Partial<T>>((acc, key, index) => {
            const item = items[index];
            acc[key as keyof T] = item?.value as T[keyof T];
            return acc;
          }, {}) as T,
          digest: firstItem.digest,
          cache: cacheStatus,
          updatedAt: firstItem.updatedAt,
        };
      }
    }

    // if the edge config cache is filled we can fall back to using it
    if (this.edgeConfigCache) {
      const cacheStatus = getCacheStatus(
        ts,
        this.edgeConfigCache.updatedAt,
        this.maxStale,
      );

      if (cacheStatus === 'HIT' || cacheStatus === 'STALE') {
        if (cacheStatus === 'STALE') {
          // TODO refresh individual items only?
          after(() => this.fetchFullConfig(ts, localOptions).catch());
        }

        return {
          value: pick(this.edgeConfigCache.items, filteredKeys) as T,
          digest: this.edgeConfigCache.digest,
          cache: getCacheStatus(
            ts,
            this.edgeConfigCache.updatedAt,
            this.maxStale,
          ),
          updatedAt: this.edgeConfigCache.updatedAt,
        };
      }
    }

    const search = new URLSearchParams(
      filteredKeys.map((key) => ['key', key] as [string, string]),
    ).toString();

    return this.enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}&${search}`,
      {
        headers: this.getHeaders(localOptions, ts),
        cache: this.cacheMode,
      },
    ).then<{
      value: T;
      digest: string;
      cache: CacheStatus;
      updatedAt: number;
    }>(async ([res, cachedRes]) => {
      // on 304s we currently don't get the cached headers back from proxy,
      // so we need to check the original response headers
      const digest = (cachedRes || res).headers.get('x-edge-config-digest');
      const updatedAt = parseTs(
        (cachedRes || res).headers.get('x-edge-config-updated-at'),
      );

      if (!updatedAt || !digest) {
        throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      }

      if (res.ok || (res.status === 304 && cachedRes)) {
        if (!digest) {
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        }
        const value = (await (
          res.status === 304 && cachedRes ? cachedRes : res
        ).json()) as T;

        // fill the itemCache with the new values
        for (const key of filteredKeys) {
          this.itemCache.set(key, {
            value: value[key as keyof T],
            updatedAt,
            digest,
            exists: value[key as keyof T] !== undefined,
          });
        }

        return { value, digest, updatedAt, cache: 'MISS' };
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

  public async all<T extends EdgeConfigItems>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    const ts = getUpdatedAt(this.connection);
    // TODO development mode?
    await this.preload();

    if (ts && this.edgeConfigCache) {
      const cacheStatus = getCacheStatus(
        ts,
        this.edgeConfigCache.updatedAt,
        this.maxStale,
      );

      // HIT
      if (cacheStatus === 'HIT') {
        return {
          value: this.edgeConfigCache.items as T,
          digest: this.edgeConfigCache.digest,
          cache: 'HIT',
          updatedAt: this.edgeConfigCache.updatedAt,
        };
      }

      if (cacheStatus === 'STALE') {
        // background refresh
        after(() => this.fetchFullConfig(ts, localOptions).catch());
        return {
          value: this.edgeConfigCache.items as T,
          digest: this.edgeConfigCache.digest,
          cache: 'STALE',
          updatedAt: this.edgeConfigCache.updatedAt,
        };
      }
    }

    return this.fetchFullConfig<T>(ts, localOptions);
  }

  private getHeaders(
    localOptions: EdgeConfigFunctionsOptions | undefined,
    minUpdatedAt: number | null,
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

    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- [@vercel/style-guide@5 migration]
    if (typeof process !== 'undefined' && process.env.VERCEL_ENV)
      localHeaders.set('x-edge-config-vercel-env', process.env.VERCEL_ENV);

    if (typeof sdkName === 'string' && typeof sdkVersion === 'string')
      localHeaders.set('x-edge-config-sdk', `${sdkName}@${sdkVersion}`);

    return localHeaders;
  }
}
