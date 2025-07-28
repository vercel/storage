import type {
  EdgeConfigValue,
  EmbeddedEdgeConfig,
  EdgeConfigFunctionsOptions,
  Connection,
  EdgeConfigClientOptions,
  Source,
} from './types';
import { ERRORS, isEmptyKey, UnexpectedNetworkError } from './utils';
import { consumeResponseBody } from './utils/consume-response-body';
import { addConsistentReadHeader } from './utils/add-consistent-read-header';

const DEFAULT_STALE_THRESHOLD = 10_000; // 10 seconds

let timestampOfLatestUpdate: number | undefined;

export function setTimestampOfLatestUpdate(timestamp: number): void {
  timestampOfLatestUpdate = timestamp;
}

function parseTs(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const parsed = Number.parseInt(updatedAt, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export class Controller {
  private edgeConfigCache: (EmbeddedEdgeConfig & { updatedAt: number }) | null =
    null;
  private itemCache = new Map<
    string,
    // an undefined value signals the key does not exist
    { value: EdgeConfigValue | undefined; updatedAt: number; digest: string }
  >();

  private connection: Connection;
  private shouldUseDevelopmentCache: boolean;
  private staleThreshold: number;
  private cacheMode: 'no-store' | 'force-cache';

  /**
   * A map of keys to pending promises
   */
  private pendingItemFetches = new Map<
    string,
    {
      minUpdatedAt: number;
      promise: Promise<{
        value: EdgeConfigValue | undefined;
        digest: string;
        source: Source;
      }>;
    }
  >();

  private pendingEdgeConfigPromise: Promise<EmbeddedEdgeConfig | null> | null =
    null;

  constructor(
    connection: Connection,
    options: EdgeConfigClientOptions,
    shouldUseDevelopmentCache: boolean,
  ) {
    this.connection = connection;
    this.shouldUseDevelopmentCache = shouldUseDevelopmentCache;
    this.staleThreshold = options.staleThreshold ?? DEFAULT_STALE_THRESHOLD;
    this.cacheMode = options.cache || 'no-store';
  }

  public async get<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T | undefined; digest: string; source: Source }> {
    // check full config cache
    // check item cache
    //
    // pick newer version on HIT

    // otherwise
    // blocking fetch if MISS
    // background fetch if STALE

    // const [state, effects] = reduce(state)
    // await processEffects(effects)

    // only use the cache if we have a timestamp of the latest update
    if (timestampOfLatestUpdate) {
      const cachedItem = this.itemCache.get(key);
      const cachedConfig = this.edgeConfigCache;
      let cached: {
        value: T | undefined;
        updatedAt: number;
        digest: string;
      } | null = null;
      if (cachedItem && cachedConfig) {
        cached =
          cachedItem.updatedAt > cachedConfig.updatedAt
            ? {
                value: cachedItem.value as T | undefined,
                updatedAt: cachedItem.updatedAt,
                digest: cachedItem.digest,
              }
            : {
                digest: cachedConfig.digest,
                value: cachedConfig.items[key] as T | undefined,
                updatedAt: cachedConfig.updatedAt,
              };
      } else if (cachedItem && !cachedConfig) {
        cached = {
          value: cachedItem.value as T | undefined,
          updatedAt: cachedItem.updatedAt,
          digest: cachedItem.digest,
        };
      } else if (!cachedItem && cachedConfig) {
        cached = {
          value: cachedConfig.items[key] as T | undefined,
          updatedAt: cachedConfig.updatedAt,
          digest: cachedConfig.digest,
        };
      }

      if (cached) {
        if (timestampOfLatestUpdate === cached.updatedAt) {
          return {
            value: cached.value,
            digest: cached.digest,
            source: 'cached-fresh',
          };
        }
        if (timestampOfLatestUpdate > cached.updatedAt) {
          // we're outdated, but check if we can serve the STALE value
          if (
            cached.updatedAt >=
            timestampOfLatestUpdate - this.staleThreshold
          ) {
            // background refresh
            // reuse existing promise if there is one
            const pendingPromise = this.pendingItemFetches.get(key);
            if (
              pendingPromise &&
              pendingPromise.minUpdatedAt >= timestampOfLatestUpdate &&
              // ensure the pending promise can not end up being stale
              pendingPromise.minUpdatedAt + this.staleThreshold >=
                timestampOfLatestUpdate
            ) {
              // do nothing
            } else {
              // TODO cancel existing pending fetch with an AbortController if
              // there is one? does this lead to problems if it is being awaited
              // by a blocking read?
              //
              // TODO use waitUntil?
              void this.fetchItem<T>(
                key,
                timestampOfLatestUpdate,
                localOptions,
              ).catch(() => null);
            }

            return {
              value: cached.value,
              digest: cached.digest,
              source: 'cached-stale',
            };
          }

          // we're outdated, but we can't serve the STALE value
          // so we need to fetch the latest value in a BLOCKING way and then
          // update the cache afterwards
          //
          // this is the same behavior as if we had no cache it at all,
          // so we just fall through
        }
      }

      // reuse existing promise if there is one
      const pendingPromise = this.pendingItemFetches.get(key);
      if (
        pendingPromise &&
        pendingPromise.minUpdatedAt >= timestampOfLatestUpdate &&
        // ensure the pending promise can not end up being stale
        pendingPromise.minUpdatedAt + this.staleThreshold >=
          timestampOfLatestUpdate
      ) {
        // TODO should we check once the promise resolves whether it ended up
        // being stale and do a blocking refetch in that case?
        return pendingPromise.promise as Promise<{
          value: T | undefined;
          digest: string;
          source: Source;
        }>;
      }
    }

    // otherwise, create a new promise
    return this.fetchItem<T>(key, timestampOfLatestUpdate, localOptions);
  }

  private fetchItem<T extends EdgeConfigValue>(
    key: string,
    minUpdatedAt: number | undefined,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T | undefined;
    digest: string;
    source: Source;
  }> {
    const promise = fetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions),
        cache: this.cacheMode,
      },
    ).then<{ value: T | undefined; digest: string; source: Source }>(
      async (res) => {
        const digest = res.headers.get('x-edge-config-digest');
        const updatedAt = parseTs(res.headers.get('x-edge-config-updated-at'));
        if (!digest) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);

        if (res.ok) {
          const value = (await res.json()) as T;
          // TODO this header is not present on responses of the real API currently,
          // but we mock it in tests already

          // set the cache if the loaded value is newer than the cached one
          if (updatedAt) {
            const existing = this.itemCache.get(key);
            if (!existing || existing.updatedAt < updatedAt) {
              this.itemCache.set(key, { value, updatedAt, digest });
            }
          }
          return { value, digest, source: 'network-blocking' };
        }

        await consumeResponseBody(res);

        if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
        if (res.status === 404) {
          // if the x-edge-config-digest header is present, it means
          // the edge config exists, but the item does not
          if (digest && updatedAt) {
            this.itemCache.set(key, { value: undefined, updatedAt, digest });
            return { value: undefined, digest, source: 'network-blocking' };
          }
          // if the x-edge-config-digest header is not present, it means
          // the edge config itself does not exist
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        }
        throw new UnexpectedNetworkError(res);
      },
    );

    // save the pending promise and the minimum updatedAt
    if (minUpdatedAt) {
      this.pendingItemFetches.set(key, { minUpdatedAt, promise });
    }

    return promise;
  }

  public async has(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ exists: boolean; digest: string; source: Source }> {
    return fetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        method: 'HEAD',
        headers: this.getHeaders(localOptions),
        cache: this.cacheMode,
      },
    ).then<{ exists: boolean; digest: string; source: Source }>((res) => {
      if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
      const digest = res.headers.get('x-edge-config-digest');

      if (!digest) {
        // if the x-edge-config-digest header is not present, it means
        // the edge config itself does not exist
        throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      }

      if (res.ok)
        return {
          digest,
          exists: res.status !== 404,
          source: 'network-blocking',
        };
      throw new UnexpectedNetworkError(res);
    });
  }

  public async digest(
    localOptions?: Pick<EdgeConfigFunctionsOptions, 'consistentRead'>,
  ): Promise<string> {
    return fetch(
      `${this.connection.baseUrl}/digest?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions),
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
        headers: this.getHeaders(localOptions),
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

  public async getAll<T>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T; digest: string }> {
    return fetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions),
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

  private getHeaders(
    localOptions: EdgeConfigFunctionsOptions | undefined,
  ): Headers {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.connection.token}`,
    };
    const localHeaders = new Headers(headers);
    if (localOptions?.consistentRead) addConsistentReadHeader(localHeaders);

    return localHeaders;
  }
}
