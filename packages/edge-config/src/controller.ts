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
 * A symbol to represent an unresolved value.
 *
 * This is used to indicate that a value is not yet available, but we want to
 * cache the fact that it exists.
 *
 * This is only used if we definitely know that the value exists, we just don't
 * know what it is yet.
 *
 * When we definitely know a value does not exist, we use "undefined" instead.
 */
const unresolvedValue = Symbol('unresolvedValue');

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

interface CachedItem<T extends EdgeConfigValue = EdgeConfigValue> {
  /**
   * An "undefined" value signals the key does not exist on the Edge Config in
   * the specified version and updatedAt timestamp.
   *
   * An "unresolved" signals that the value is not yet available,
   */
  value: T | undefined | typeof unresolvedValue;
  /** the timestamp of the edge config's last update (not the item's) */
  updatedAt: number;
  digest: string;
}

interface ResolvedCachedItem<T extends EdgeConfigValue = EdgeConfigValue> {
  value: Exclude<T, typeof unresolvedValue> | undefined;
  updatedAt: number;
  digest: string;
}

export class Controller {
  private edgeConfigCache: (EmbeddedEdgeConfig & { updatedAt: number }) | null =
    null;
  private itemCache = new Map<string, CachedItem>();
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
      ).then((res) => ({
        // TODO typescript should know that GET never returns unresolvedValue,
        // so we should not need the explicit "as" cast or the whole "then" statement
        value: res.value as T | undefined,
        digest: res.digest,
        cache: res.cache,
      }));
    }

    // check full config cache
    // check item cache
    //
    // if HIT, pick newer version

    // otherwise
    // if STALE, serve cached value and trigger background refresh
    // if MISS, perform blocking fetch

    // only use the cache if we have a timestamp of the latest update
    if (timestampOfLatestUpdate) {
      const cached = this.getCachedItem<T>(key, true) as
        | ResolvedCachedItem<T>
        | undefined;

      if (cached) {
        const cacheStatus = getCacheStatus(
          timestampOfLatestUpdate,
          cached.updatedAt,
          this.staleThreshold,
        );

        // HIT
        if (cacheStatus === 'HIT') {
          return {
            value: cached.value,
            digest: cached.digest,
            cache: 'HIT',
          };
        }

        // we're outdated, but we can still serve the STALE value
        if (cacheStatus === 'STALE') {
          // background refresh
          waitUntil(
            this.fetchItem<T>(
              'GET',
              key,
              timestampOfLatestUpdate,
              localOptions,
            ).catch(() => null),
          );

          return {
            value: cached.value,
            digest: cached.digest,
            cache: 'STALE',
          };

          // we're outdated, but we can't serve the STALE value
          // so we need to fetch the latest value in a BLOCKING way and then
          // update the cache afterwards
          //
          // this is the same behavior as if we had no cache it at all,
          // so we just fall through
        }
      }
    }

    // MISS
    return this.fetchItem<T>(
      'GET',
      key,
      timestampOfLatestUpdate,
      localOptions,
    ).then((res) => ({
      // TODO typescript should know that GET never returns unresolvedValue,
      // so we should not need the explicit "as" cast or the whole "then" statement
      value: res.value as T | undefined,
      digest: res.digest,
      cache: res.cache,
    }));
  }

  /**
   * Returns an item from the item cache or edge config cache, depending on
   * which value is newer, or null if there is no cached value.
   */
  private getCachedItem<T extends EdgeConfigValue>(
    key: string,
    ignoreUnresolved: boolean,
  ): typeof ignoreUnresolved extends true
    ? ResolvedCachedItem<T> | null
    : CachedItem<T> | null {
    const v = this.itemCache.get(key);
    const cachedItem =
      ignoreUnresolved && v?.value === unresolvedValue ? undefined : v;
    const cachedConfig = this.edgeConfigCache;

    if (cachedItem && cachedConfig) {
      return cachedItem.updatedAt > cachedConfig.updatedAt
        ? (cachedItem as typeof ignoreUnresolved extends true
            ? ResolvedCachedItem<T>
            : CachedItem<T>)
        : ({
            digest: cachedConfig.digest,
            value: cachedConfig.items[key] as T,
            updatedAt: cachedConfig.updatedAt,
          } as typeof ignoreUnresolved extends true
            ? ResolvedCachedItem<T>
            : CachedItem<T>);
    }

    if (cachedItem && !cachedConfig) {
      return cachedItem as typeof ignoreUnresolved extends true
        ? ResolvedCachedItem<T>
        : CachedItem<T>;
    }

    if (!cachedItem && cachedConfig) {
      return {
        value: cachedConfig.items[key],
        updatedAt: cachedConfig.updatedAt,
        digest: cachedConfig.digest,
      } as typeof ignoreUnresolved extends true
        ? ResolvedCachedItem<T>
        : CachedItem<T>;
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
        // TODO this header is not present on responses of the real API currently,
        // but we mock it in tests already
        const updatedAt = parseTs(res.headers.get('x-edge-config-updated-at'));

        if (res.status === 401) {
          // don't need to empty cachedRes as 401s can never be cached anyhow
          await consumeResponseBody(res);
          throw new Error(ERRORS.UNAUTHORIZED);
        }

        // this can't really happen, but we need to ensure digest exists
        if (!digest) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);

        if (res.ok || (res.status === 304 && cachedRes)) {
          const value = (await (
            res.status === 304 && cachedRes ? cachedRes : res
          ).json()) as T;

          if (res.status === 304) await consumeResponseBody(res);

          if (updatedAt) {
            const existing = this.edgeConfigCache;
            if (!existing || existing.updatedAt < updatedAt) {
              this.edgeConfigCache = {
                items: value,
                updatedAt,
                digest,
              };
            }
          }

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
    value: T | undefined | typeof unresolvedValue;
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
      value: typeof method extends 'GET'
        ? T | undefined
        : T | undefined | typeof unresolvedValue;
      digest: string;
      cache: CacheStatus;
    }>(async ([res, cachedRes]) => {
      const digest = res.headers.get('x-edge-config-digest');
      // TODO this header is not present on responses of the real API currently,
      // but we mock it in tests already
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

        const value =
          method === 'GET'
            ? ((await (
                res.status === 304 && cachedRes ? cachedRes : res
              ).json()) as T)
            : unresolvedValue;

        if (updatedAt) {
          const existing = this.itemCache.get(key);
          // set the cache if the loaded value is newer than the cached one
          if (!existing || existing.updatedAt < updatedAt) {
            this.itemCache.set(key, {
              value,
              updatedAt,
              digest,
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
        // if the x-edge-config-digest header is present, it means
        // the edge config exists, but the item does not
        if (digest && updatedAt) {
          const existing = this.itemCache.get(key);
          if (!existing || existing.updatedAt < updatedAt) {
            this.itemCache.set(key, { value: undefined, updatedAt, digest });
          }
          return { value: undefined, digest, cache: 'MISS' };
        }
        // if the x-edge-config-digest header is not present, it means
        // the edge config itself does not exist
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

    // check full config cache
    // check item cache
    //
    // if HIT, pick newer version

    // otherwise
    // if STALE, serve cached value and trigger background refresh
    // if MISS, perform blocking fetch

    // only use the cache if we have a timestamp of the latest update
    if (timestampOfLatestUpdate) {
      const cached = this.getCachedItem(key, false) as CachedItem | undefined;

      if (cached) {
        const cacheStatus = getCacheStatus(
          timestampOfLatestUpdate,
          cached.updatedAt,
          this.staleThreshold,
        );

        // HIT
        if (cacheStatus === 'HIT') {
          return {
            exists: cached.value !== undefined,
            digest: cached.digest,
            cache: 'HIT',
          };
        }

        // we're outdated, but we can still serve the STALE value
        if (cacheStatus === 'STALE') {
          // background refresh
          waitUntil(
            this.fetchItem(
              'HEAD',
              key,
              timestampOfLatestUpdate,
              localOptions,
            ).catch(() => null),
          );

          return {
            exists: cached.value !== undefined,
            digest: cached.digest,
            cache: 'STALE',
          };

          // we're outdated, but we can't serve the STALE value
          // so we need to fetch the latest value in a BLOCKING way and then
          // update the cache afterwards
          //
          // this is the same behavior as if we had no cache it at all,
          // so we just fall through
        }
      }
    }

    // MISS
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
