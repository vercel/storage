import { waitUntil } from '@vercel/functions';
import { createEventSource, type EventSourceClient } from 'eventsource-client';
import { name as sdkName, version as sdkVersion } from '../package.json';
import { readLocalEdgeConfig } from './utils/mockable-import';
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

const DEFAULT_STALE_THRESHOLD = 10;
const privateEdgeConfigSymbol = Symbol.for('privateEdgeConfig');

interface CacheEntry<T = EdgeConfigValue> {
  value: T | undefined;
  updatedAt: number;
  digest: string;
  exists: boolean;
}

function after(fn: () => Promise<unknown>): void {
  waitUntil(
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    }).then(() => fn()),
  );
}

/**
 * Reads the updatedAt timestamp of the most recent Edge Config update,
 * so we can compare that to what we have in cache.
 */
function getMostRecentUpdateTimestamp(connection: Connection): number | null {
  const privateEdgeConfig = Reflect.get(globalThis, privateEdgeConfigSymbol) as
    | { getUpdatedAt: (id: string) => number | null }
    | undefined;

  return typeof privateEdgeConfig === 'object' &&
    typeof privateEdgeConfig.getUpdatedAt === 'function'
    ? privateEdgeConfig.getUpdatedAt(connection.id)
    : null;
}

function parseTs(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const parsed = Number.parseInt(updatedAt, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

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

class CacheManager {
  private itemCache = new Map<string, CacheEntry>();
  private edgeConfigCache: EmbeddedEdgeConfig | null = null;

  setItem<T extends EdgeConfigValue>(
    key: string,
    value: T | undefined,
    updatedAt: number,
    digest: string,
    exists: boolean,
  ): void {
    const existing = this.itemCache.get(key);
    if (existing && existing.updatedAt >= updatedAt) return;
    this.itemCache.set(key, { value, updatedAt, digest, exists });
  }

  setEdgeConfig(next: EmbeddedEdgeConfig): void {
    if (!next.updatedAt) return;
    const existing = this.edgeConfigCache;
    if (existing && existing.updatedAt >= next.updatedAt) return;
    this.edgeConfigCache = next;
  }

  getItem<T extends EdgeConfigValue>(
    key: string,
    method: 'GET' | 'HEAD',
  ): CacheEntry<T> | null {
    const item = this.itemCache.get(key);
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

  getEdgeConfig(): EmbeddedEdgeConfig | null {
    return this.edgeConfigCache;
  }
}

class StreamManager {
  private stream: EventSourceClient | null = null;
  private cacheManager: CacheManager;
  private connection: Connection;

  constructor(cacheManager: CacheManager, connection: Connection) {
    this.cacheManager = cacheManager;
    this.connection = connection;
  }

  async init(): Promise<void> {
    const currentEdgeConfig = this.cacheManager.getEdgeConfig();

    this.stream = createEventSource({
      url: `https://api.vercel.com/v1/edge-config/${this.connection.id}/stream`,
      headers: {
        Authorization: `Bearer ${this.connection.token}`,
        ...(currentEdgeConfig?.updatedAt
          ? { 'x-edge-config-updated-at': String(currentEdgeConfig.updatedAt) }
          : {}),
      },
    });

    for await (const { data, event } of this.stream) {
      if (event === 'info' && data === 'token_invalidated') {
        this.stream.close();
        return;
      }

      if (event === 'embed') {
        try {
          const parsedEdgeConfig = JSON.parse(data) as EmbeddedEdgeConfig;
          this.cacheManager.setEdgeConfig(parsedEdgeConfig);
        } catch (e) {
          // eslint-disable-next-line no-console -- intentional error logging
          console.error(
            '@vercel/edge-config: Error parsing streamed edge config',
            e,
          );
        }
      }
    }

    this.stream.close();
  }

  close(): void {
    this.stream?.close();
  }
}

class NetworkClient {
  private enhancedFetch: ReturnType<typeof createEnhancedFetch>;
  private connection: Connection;
  private cacheMode: 'no-store' | 'force-cache';

  constructor(connection: Connection, cacheMode: 'no-store' | 'force-cache') {
    this.connection = connection;
    this.cacheMode = cacheMode;
    this.enhancedFetch = createEnhancedFetch();
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

    if (process.env.VERCEL_ENV) {
      localHeaders.set('x-edge-config-vercel-env', process.env.VERCEL_ENV);
    }

    if (typeof sdkName === 'string' && typeof sdkVersion === 'string') {
      localHeaders.set('x-edge-config-sdk', `${sdkName}@${sdkVersion}`);
    }

    return localHeaders;
  }

  async fetchItem<T extends EdgeConfigValue>(
    method: 'GET' | 'HEAD',
    key: string,
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T | undefined;
    digest: string;
    exists: boolean;
    updatedAt: number;
  }> {
    const [res, cachedRes] = await this.enhancedFetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        method,
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    );

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
      await Promise.all([
        consumeResponseBody(res),
        cachedRes ? consumeResponseBody(cachedRes) : null,
      ]);
      throw new UnexpectedNetworkError(res);
    }

    if (!digest || !updatedAt) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);

    if (res.ok || (res.status === 304 && cachedRes)) {
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

      return {
        value,
        digest,
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
        return {
          value: undefined,
          digest,
          exists: false,
          updatedAt,
        };
      }
      throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    }
    throw new UnexpectedNetworkError(res);
  }

  async fetchFullConfig<ItemsType extends Record<string, EdgeConfigValue>>(
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<EmbeddedEdgeConfig> {
    const [res, cachedRes] = await this.enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    );

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

    if (res.ok || (res.status === 304 && cachedRes)) {
      const value = (await (
        res.status === 304 && cachedRes ? cachedRes : res
      ).json()) as ItemsType;

      if (res.status === 304) await consumeResponseBody(res);

      return { items: value, digest, updatedAt };
    }

    throw new UnexpectedNetworkError(res);
  }

  async fetchMultipleItems<ItemsType extends EdgeConfigItems>(
    keys: string[],
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: ItemsType;
    digest: string;
    updatedAt: number;
  }> {
    const search = new URLSearchParams(
      keys.map((key) => ['key', key] as [string, string]),
    ).toString();

    const [res, cachedRes] = await this.enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}&${search}`,
      {
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    );

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
      ).json()) as ItemsType;

      return { value, digest, updatedAt };
    }
    await consumeResponseBody(res);

    if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
    if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    throw new UnexpectedNetworkError(res);
  }

  async fetchDigest(
    localOptions?: Pick<EdgeConfigFunctionsOptions, 'consistentRead'>,
  ): Promise<string> {
    const ts = getMostRecentUpdateTimestamp(this.connection);
    const res = await fetch(
      `${this.connection.baseUrl}/digest?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, ts),
        cache: this.cacheMode,
      },
    );

    if (res.ok) return res.json() as Promise<string>;
    await consumeResponseBody(res);
    throw new UnexpectedNetworkError(res);
  }
}

export class Controller {
  private cacheManager: CacheManager;
  private networkClient: NetworkClient;
  private streamManager: StreamManager | null = null;
  private connection: Connection;
  private maxStale: number;
  private preloadPromise: Promise<void> | null = null;

  constructor(
    connection: Connection,
    options: EdgeConfigClientOptions & {
      enableDevelopmentStream: boolean;
    },
  ) {
    this.connection = connection;
    this.maxStale = options.maxStale ?? DEFAULT_STALE_THRESHOLD;
    this.cacheManager = new CacheManager();
    this.networkClient = new NetworkClient(
      connection,
      options.cache || 'no-store',
    );

    if (options.enableDevelopmentStream && connection.type === 'vercel') {
      this.streamManager = new StreamManager(this.cacheManager, connection);
      void this.streamManager.init().catch((error) => {
        // eslint-disable-next-line no-console -- intentional error logging
        console.error('@vercel/edge-config: Stream error', error);
      });
    }
  }

  private async preload(): Promise<void> {
    if (this.connection.type !== 'vercel') return;

    // Return existing promise if already loading
    if (this.preloadPromise) return this.preloadPromise;

    // Create and store the promise to prevent concurrent calls
    this.preloadPromise = (async () => {
      try {
        const mod = await readLocalEdgeConfig<{ default: EmbeddedEdgeConfig }>(
          this.connection.id,
        );

        if (!mod) return;

        const edgeConfig = this.cacheManager.getEdgeConfig();
        const hasNewerEntry =
          edgeConfig && edgeConfig.updatedAt > mod.default.updatedAt;

        if (hasNewerEntry) return;

        this.cacheManager.setEdgeConfig(mod.default);
      } catch (e) {
        // eslint-disable-next-line no-console -- intentional error logging
        console.error(
          '@vercel/edge-config: Error reading local edge config',
          e,
        );
      }
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
        this.fetchAndCacheItem<T>(
          method,
          key,
          mostRecentUpdateTs,
          localOptions,
          false,
        ).catch(),
      );
      return { ...cached, cache: 'STALE' };
    }

    return null;
  }

  private async fetchAndCacheFullConfig<
    T extends Record<string, EdgeConfigValue>,
  >(
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    const result = await this.networkClient.fetchFullConfig<T>(
      minUpdatedAt,
      localOptions,
    );

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
    try {
      const result = await this.networkClient.fetchItem<T>(
        method,
        key,
        minUpdatedAt,
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
    const ts = getMostRecentUpdateTimestamp(this.connection);
    const cached = this.readCache<T>('GET', key, ts, localOptions);
    if (cached) return cached;
    return this.fetchAndCacheItem<T>('GET', key, ts, localOptions, true);
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
    const ts = getMostRecentUpdateTimestamp(this.connection);
    const cached = this.readCache<T>('HEAD', key, ts, localOptions);
    if (cached) return cached;
    return this.fetchAndCacheItem<T>('HEAD', key, ts, localOptions, true);
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

    const ts = getMostRecentUpdateTimestamp(this.connection);

    if (!localOptions?.metadata && filteredKeys.length === 0) {
      return {
        value: {} as T,
        digest: '',
        cache: 'HIT',
        updatedAt: -1,
      };
    }

    await this.preload();

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
          after(() => this.fetchAndCacheFullConfig(ts, localOptions).catch());
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
          after(() => this.fetchAndCacheFullConfig(ts, localOptions).catch());
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
      ts,
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

  public async all<T extends EdgeConfigItems>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T;
    digest: string;
    cache: CacheStatus;
    updatedAt: number;
  }> {
    await this.preload();
    const ts = getMostRecentUpdateTimestamp(this.connection);

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
        after(() => this.fetchAndCacheFullConfig(ts, localOptions).catch());
        return {
          value: edgeConfig.items as T,
          digest: edgeConfig.digest,
          cache: 'STALE',
          updatedAt: edgeConfig.updatedAt,
        };
      }
    }

    return this.fetchAndCacheFullConfig<T>(ts, localOptions);
  }
}
