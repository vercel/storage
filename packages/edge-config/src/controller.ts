import type {
  EdgeConfigValue,
  EmbeddedEdgeConfig,
  EdgeConfigFunctionsOptions,
  EdgeConfigClientOptions,
  CacheStatus,
  EdgeConfigItems,
} from './types';
import { isEmptyKey, pick } from './utils';
import {
  getBuildEmbeddedEdgeConfig,
  getLayeredEdgeConfig,
} from './utils/readers';
import { after } from './utils/after';
import { StreamManager } from './utils/stream-manager';
import { NetworkClient } from './utils/network-client';
import { CacheManager } from './utils/cache-manager';
import type { Connection } from './utils/connection';

const DEFAULT_STALE_THRESHOLD = 10;

function getCacheStatus(
  latestUpdate: number | null,
  updatedAt: number,
  maxStale: number,
): CacheStatus {
  if (latestUpdate === null) return 'MISS';
  if (latestUpdate <= updatedAt) return 'HIT';

  const now = Date.now();
  const maxStaleMs = maxStale * 1000;

  if (now - latestUpdate <= maxStaleMs) return 'STALE';
  return 'MISS';
}

export class Controller {
  private cacheManager: CacheManager;
  private networkClient: NetworkClient;
  private streamManager: StreamManager | null = null;
  private connection: Connection;
  private maxStale: number;
  private preloadPromise: Promise<EmbeddedEdgeConfig | null> | null = null;

  constructor(
    connection: Connection,
    options: EdgeConfigClientOptions & { enableStream: boolean },
  ) {
    this.connection = connection;
    this.maxStale = options.maxStale ?? DEFAULT_STALE_THRESHOLD;
    this.cacheManager = new CacheManager();
    this.networkClient = new NetworkClient(
      connection,
      options.cache || 'no-store',
    );

    if (options.enableStream && connection.type === 'vercel') {
      this.streamManager = new StreamManager(connection, (edgeConfig) => {
        this.cacheManager.setEdgeConfig(edgeConfig);
      });
      void this.streamManager
        .init(this.preload(), () => this.cacheManager.getEdgeConfig())
        .catch((error) => {
          // eslint-disable-next-line no-console -- intentional error logging
          console.error('@vercel/edge-config: Stream error', error);
        });
    }
  }

  /**
   * Preloads the Edge Config from the build time embed or from the layer.
   *
   * Races the load of the embedded and layered Edge Configs, and also
   * refreshes in the background in case there was a race winner.
   *
   * We basically try to return a valid result (ts) as early as possible, while
   * also making sure we update to the later version if there is one.
   */
  private async preload(): Promise<EmbeddedEdgeConfig | null> {
    if (this.connection.type !== 'vercel') return null;

    // Return existing promise if already loading
    if (this.preloadPromise) return this.preloadPromise;

    // Create and store the promise to prevent concurrent calls
    this.preloadPromise = (async () => {
      // The layered Edge Config is always going to be newer than the embedded one,
      // so we check it first and only fall back to the embedded one.
      const layeredEdgeConfig = await getLayeredEdgeConfig(this.connection.id);
      if (layeredEdgeConfig) {
        this.cacheManager.setEdgeConfig(layeredEdgeConfig);
        return layeredEdgeConfig;
      }

      const buildEdgeConfig = await getBuildEmbeddedEdgeConfig(
        this.connection.id,
      );
      if (buildEdgeConfig) {
        this.cacheManager.setEdgeConfig(buildEdgeConfig);
        return buildEdgeConfig;
      }

      return null;
    })();

    return this.preloadPromise;
  }

  private readCache<T extends EdgeConfigValue>(
    method: 'GET' | 'HEAD',
    key: string,
    /**
     * The timestamp of the most recent update.
     * Read from the headers through the bridge.
     */
    mostRecentUpdateTs: number | undefined | null,
    localOptions: EdgeConfigFunctionsOptions | undefined,
  ): {
    value: T | undefined;
    digest: string;
    cache: CacheStatus;
    exists: boolean;
    updatedAt: number;
  } | null {
    // TODO we can only trust this if there is no ts, or if there is a ts and an updatedAt info
    if (this.streamManager) {
      const item = this.cacheManager.getItem<T>(key, method);
      // no need to fall back to anything else if there is a stream manager,
      if (!item) return null;

      // Only use if no timestamp was given, or if we already have this or a newer entry.
      // This prevents us from
      if (!mostRecentUpdateTs || item.updatedAt >= mostRecentUpdateTs) {
        return {
          value: item.value,
          digest: item.digest,
          cache: 'HIT',
          exists: item.exists,
          updatedAt: item.updatedAt,
        };
      }
    }

    if (!mostRecentUpdateTs) return null;

    const cached = this.cacheManager.getItem<T>(key, method);
    if (!cached) return null;

    const cacheStatus = getCacheStatus(
      mostRecentUpdateTs,
      cached.updatedAt,
      this.maxStale,
    );

    if (cacheStatus === 'HIT') return { ...cached, cache: 'HIT' };

    if (cacheStatus === 'STALE') {
      after(() =>
        this.fetchAndCacheItem<T>(method, key, localOptions, false).catch(),
      );
      return { ...cached, cache: 'STALE' };
    }

    return null;
  }

  private async fetchAndCacheFullConfig<
    T extends Record<string, EdgeConfigValue>,
  >(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    const result = await this.networkClient.fetchFullConfig<T>(localOptions);

    this.cacheManager.setEdgeConfig(result);

    return {
      value: result.items as T,
      digest: result.digest,
      cache: 'MISS',
      updatedAt: result.updatedAt,
    };
  }

  private async fetchAndCacheItem<T extends EdgeConfigValue>(
    method: 'GET' | 'HEAD',
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
    staleIfError?: boolean,
  ): Promise<{
    value: T | undefined;
    digest: string;
    cache: CacheStatus;
    exists: boolean;
    updatedAt: number;
  }> {
    try {
      const result = await this.networkClient.fetchItem<T>(
        method,
        key,
        localOptions,
      );

      this.cacheManager.setItem(
        key,
        result.value,
        result.updatedAt,
        result.digest,
        result.exists,
      );

      return { ...result, cache: 'MISS' };
    } catch (error) {
      if (staleIfError) {
        const cached = this.cacheManager.getItem<T>(key, method);
        if (cached) return { ...cached, cache: 'STALE' };
      }
      throw error;
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
    await this.preload();
    await this.streamManager?.primed();

    const ts = this.connection.getMostRecentUpdateTimestamp();

    // preload
    // if stream
    //   - wait until stream is primed, or opt out of streaming
    //   - use streamed value
    // if ts, check cache status [check per-item and full cache]
    //   - on cache HIT, use cached value
    //   - on cache STALE, use cached value and refresh in background
    //   - on cache MISS, use network value (blocking fetch)
    // if no ts, use 10s cache (or swr?)

    const cached = this.readCache<T>('GET', key, ts, localOptions);
    if (cached) return cached;
    return this.fetchAndCacheItem<T>('GET', key, localOptions, true);
  }

  public async has<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T | undefined;
    exists: boolean;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    await this.preload();
    await this.streamManager?.primed();

    const ts = this.connection.getMostRecentUpdateTimestamp();
    const cached = this.readCache<T>('HEAD', key, ts, localOptions);
    if (cached) return cached;
    return this.fetchAndCacheItem<T>('HEAD', key, localOptions, true);
  }

  public async getMany<T extends EdgeConfigItems>(
    keys: string[],
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    if (!Array.isArray(keys)) {
      throw new Error('@vercel/edge-config: keys must be an array');
    }

    const filteredKeys = keys.filter(
      (key) => typeof key === 'string' && !isEmptyKey(key),
    );

    const edgeConfig = this.cacheManager.getEdgeConfig();
    if (this.streamManager && edgeConfig) {
      return {
        value: pick(edgeConfig.items, filteredKeys) as T,
        digest: edgeConfig.digest,
        cache: 'HIT',
        updatedAt: edgeConfig.updatedAt,
      };
    }

    const ts = this.connection.getMostRecentUpdateTimestamp();

    if (!localOptions?.metadata && filteredKeys.length === 0) {
      return {
        value: {} as T,
        digest: '',
        cache: 'HIT',
        updatedAt: -1,
      };
    }

    await this.preload();
    await this.streamManager?.primed();

    const items = filteredKeys.map((key) =>
      this.cacheManager.getItem(key, 'GET'),
    );
    const firstItem = items[0];

    const canUseItemCache =
      firstItem &&
      items.every(
        (item) =>
          item?.exists &&
          item.value !== undefined &&
          item.updatedAt === firstItem.updatedAt,
      );

    const currentEdgeConfig = this.cacheManager.getEdgeConfig();

    // First try individual item cache if all items are consistent and newer
    if (
      canUseItemCache &&
      (!currentEdgeConfig || currentEdgeConfig.updatedAt < firstItem.updatedAt)
    ) {
      const cacheStatus = getCacheStatus(
        ts,
        firstItem.updatedAt,
        this.maxStale,
      );

      if (cacheStatus === 'HIT' || cacheStatus === 'STALE') {
        if (cacheStatus === 'STALE') {
          after(() => this.fetchAndCacheFullConfig(localOptions).catch());
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

    // Fallback to edge config cache
    if (currentEdgeConfig) {
      const cacheStatus = getCacheStatus(
        ts,
        currentEdgeConfig.updatedAt,
        this.maxStale,
      );

      if (cacheStatus === 'HIT' || cacheStatus === 'STALE') {
        if (cacheStatus === 'STALE') {
          after(() => this.fetchAndCacheFullConfig(localOptions).catch());
        }

        return {
          value: pick(currentEdgeConfig.items, filteredKeys) as T,
          digest: currentEdgeConfig.digest,
          cache: cacheStatus,
          updatedAt: currentEdgeConfig.updatedAt,
        };
      }
    }

    const result = await this.networkClient.fetchMultipleItems<T>(
      filteredKeys,
      localOptions,
    );

    for (const key of filteredKeys) {
      this.cacheManager.setItem(
        key,
        result.value[key as keyof T],
        result.updatedAt,
        result.digest,
        result.value[key as keyof T] !== undefined,
      );
    }

    return { ...result, cache: 'MISS' };
  }

  public async getAll<T extends EdgeConfigItems>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    await this.preload();
    await this.streamManager?.primed();
    const ts = this.connection.getMostRecentUpdateTimestamp();

    const edgeConfig = this.cacheManager.getEdgeConfig();
    if (ts && edgeConfig) {
      const cacheStatus = getCacheStatus(
        ts,
        edgeConfig.updatedAt,
        this.maxStale,
      );

      if (cacheStatus === 'HIT') {
        return {
          value: edgeConfig.items as T,
          digest: edgeConfig.digest,
          cache: 'HIT',
          updatedAt: edgeConfig.updatedAt,
        };
      }

      if (cacheStatus === 'STALE') {
        after(() => this.fetchAndCacheFullConfig(localOptions).catch());
        return {
          value: edgeConfig.items as T,
          digest: edgeConfig.digest,
          cache: 'STALE',
          updatedAt: edgeConfig.updatedAt,
        };
      }
    }

    return this.fetchAndCacheFullConfig<T>(localOptions);
  }
}
