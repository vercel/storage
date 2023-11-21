import DataLoader from 'dataloader';
import { readFile } from '@vercel/edge-config-fs';
import type {
  Connection,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from '../types';
import { fetchWithHttpCache } from './fetch-with-http-cache';
import { ERRORS, hasOwnProperty, isDynamicServerError } from '.';

async function consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(
  res: Response,
): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined') return;

  // Read body to avoid memory leaks in nodejs
  // see https://github.com/nodejs/undici/blob/v5.21.2/README.md#garbage-collection
  // see https://github.com/node-fetch/node-fetch/issues/83
  await res.arrayBuffer();
}

/**
 * Reads an Edge Config from the local file system.
 * This is used at runtime on serverless functions.
 */
async function getFileSystemEdgeConfig(
  connection: Connection,
): Promise<EmbeddedEdgeConfig | null> {
  // can't optimize non-vercel hosted edge configs
  if (connection.type !== 'vercel') return null;
  // can't use fs optimizations outside of lambda
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return null;

  try {
    const content = await readFile(
      `/opt/edge-config/${connection.id}.json`,
      'utf-8',
    );
    return JSON.parse(content) as EmbeddedEdgeConfig;
  } catch {
    return null;
  }
}

export function createLoaders({
  connection,
  sdkVersion,
  sdkName,
  staleIfError,
  inMemoryDevelopmentCache,
}: {
  connection: Connection;
  sdkVersion?: string;
  sdkName?: string;
  staleIfError?: number | false;
  inMemoryDevelopmentCache: /**
   * null means the cache should not be used, either because we're not in
   * development or because it was disabled manually when creating the client
   */
  null | {
    /**
     * This is set in case we are currently fetching an embedded edge config.
     */
    pendingPromise: Promise<EmbeddedEdgeConfig> | null;
    /**
     * The currently cached embedded edge config.
     */
    value: EmbeddedEdgeConfig | null;
  };
}): {
  get: DataLoader<string, EdgeConfigValue | undefined, string>;
  getAll: DataLoader<string, EdgeConfigItems, string>;
  has: DataLoader<string, boolean, string>;
  digest: DataLoader<string, string, string>;
} {
  const baseUrl = connection.baseUrl;
  const version = connection.version; // version of the edge config read access api we talk to
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.token}`,
  };

  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- [@vercel/style-guide@5 migration]
  if (typeof process !== 'undefined' && process.env.VERCEL_ENV)
    headers['x-edge-config-vercel-env'] = process.env.VERCEL_ENV;

  if (typeof sdkName === 'string' && typeof sdkVersion === 'string')
    headers['x-edge-config-sdk'] = `${sdkName}@${sdkVersion}`;

  if (typeof staleIfError === 'number' && staleIfError > 0)
    headers['cache-control'] = `stale-if-error=${staleIfError}`;

  // The Edge Runtime does not support process.nextTick which is used
  // by dataloader's default batchScheduleFn function, so we need to
  // provide a different scheduling function for edge runtime
  const batchScheduleFn: DataLoader.Options<
    string,
    unknown,
    string
  >['batchScheduleFn'] =
    typeof EdgeRuntime === 'string'
      ? (callback) => setTimeout(callback, 0)
      : undefined;

  const hasMap = new Map<string, Promise<boolean>>();
  const getAllMap = new Map<string, Promise<EdgeConfigItems>>();
  const getMap = new Map<string, Promise<EdgeConfigValue | undefined>>();

  function createEmbeddedEdgeConfigPromise(): Promise<EmbeddedEdgeConfig> {
    if (!inMemoryDevelopmentCache) throw new Error('');

    const promise = fetchWithHttpCache(`${baseUrl}?version=${version}`, {
      headers: new Headers(headers),
      cache: 'no-store',
    }).then(
      async (res) => {
        if (res.ok) {
          return (await res.json()) as EmbeddedEdgeConfig;
        }
        await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

        if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
        // the /items endpoint never returns 404, so if we get a 404
        // it means the edge config itself did not exist
        if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        if (res.cachedResponseBody !== undefined) {
          return res.cachedResponseBody;
        }
        throw new Error(ERRORS.UNEXPECTED);
      },
      (error) => {
        inMemoryDevelopmentCache.pendingPromise = null;
        if (isDynamicServerError(error)) throw error;
        throw new Error(ERRORS.NETWORK);
      },
    ) as Promise<EmbeddedEdgeConfig>;

    // don't make this part of the offical promise we return, to avoid
    // running it for every call
    void promise
      .then((embeddedEdgeConfig) => {
        inMemoryDevelopmentCache.value = embeddedEdgeConfig;
      })
      .finally(() => {
        inMemoryDevelopmentCache.pendingPromise = null;
      });

    return promise;
  }

  /**
   * This loader is used in development only.
   *
   * Since it's used in development only, it can not benefit from deduping
   * based on requestContext, since there will be no request context.
   *
   * This loader is used to load the whole embedded edge config, which is then
   * used when resolving other calls like `get`.
   *
   * This loader further behaves in a stale-while-revalidate like manner, since
   * it will refresh the underlying value after returning the current value.
   */
  async function getInMemoryEdgeConfig(): Promise<null | EmbeddedEdgeConfig> {
    // only use the loader if the cache should acutally be used, which is the
    // case when inMemoryDevelopmentCache is defined
    if (!inMemoryDevelopmentCache) return null;

    // refresh the underlying value in stale-while-revalidate manner
    //
    // when there is already a pending promise, we just attach ourselves to it
    const embeddedEdgeConfigPromise = inMemoryDevelopmentCache.pendingPromise
      ? inMemoryDevelopmentCache.pendingPromise
      : createEmbeddedEdgeConfigPromise();

    inMemoryDevelopmentCache.pendingPromise = embeddedEdgeConfigPromise;

    // return previous value if it exits, for swr semantics
    return inMemoryDevelopmentCache.value
      ? inMemoryDevelopmentCache.value
      : embeddedEdgeConfigPromise;
  }

  const hasLoader = new DataLoader(
    async (keys: readonly string[]) => {
      const localEdgeConfig =
        (await getInMemoryEdgeConfig()) ||
        (await getFileSystemEdgeConfig(connection));

      if (localEdgeConfig) {
        return keys.map((key) => hasOwnProperty(localEdgeConfig.items, key));
      }

      const allItemsPromise = getAllMap.get('#');
      if (allItemsPromise) {
        try {
          const allItems = await allItemsPromise;
          return keys.map((key) => hasOwnProperty(allItems, key));
        } catch {
          /* ignored */
        }
      }

      return Promise.all(
        // TODO introduce an endpoint for batch evaluating has()
        keys.map((key) => {
          // this is a HEAD request anyhow, no need for fetchWithHttpCache
          return fetch(`${baseUrl}/item/${key}?version=${version}`, {
            method: 'HEAD',
            headers: new Headers(headers),
            cache: 'no-store',
          }).then(
            (res) => {
              if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
              if (res.status === 404) {
                // if the x-edge-config-digest header is present, it means
                // the edge config exists, but the item does not
                if (res.headers.has('x-edge-config-digest')) return false;
                // if the x-edge-config-digest header is not present, it means
                // the edge config itself does not exist
                throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
              }
              if (res.ok) return true;
              throw new Error(ERRORS.UNEXPECTED);
            },
            (error) => {
              if (isDynamicServerError(error)) throw error;
              throw new Error(ERRORS.NETWORK);
            },
          );
        }),
      );
    },
    {
      batchScheduleFn,
      // disable batching until we have an endpoint to batch evaluate "has" calls,
      // otherwise the slowest has call will currently delay all others
      maxBatchSize: 1,
      cacheMap: hasMap,
    },
  );

  const getAllLoader = new DataLoader(
    async (keys: readonly string[]) => {
      // as every edge config has a single "all" only, we use # as the key
      // to load all items
      if (keys.length !== 1 || keys[0] !== '#') {
        throw new Error('unexpected key passed to digest');
      }

      const localEdgeConfig =
        (await getInMemoryEdgeConfig()) ||
        (await getFileSystemEdgeConfig(connection));

      if (localEdgeConfig) {
        // returns an array as "#" is the only key
        return [localEdgeConfig.items];
      }

      const edgeConfigItems = (await fetchWithHttpCache(
        `${baseUrl}/items?version=${version}`,
        {
          headers: new Headers(headers),
          cache: 'no-store',
        },
      ).then(
        async (res) => {
          if (res.ok) {
            return (await res.json()) as EdgeConfigItems;
          }
          await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

          if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
          // the /items endpoint never returns 404, so if we get a 404
          // it means the edge config itself did not exist
          if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
          if (res.cachedResponseBody !== undefined) {
            return res.cachedResponseBody;
          }
          throw new Error(ERRORS.UNEXPECTED);
        },
        (error) => {
          if (isDynamicServerError(error)) throw error;
          throw new Error(ERRORS.NETWORK);
        },
      )) as EdgeConfigItems;

      return [edgeConfigItems];
    },
    { batchScheduleFn, cacheMap: getAllMap },
  );

  const getLoader = new DataLoader<string, EdgeConfigValue | undefined, string>(
    async (keys: readonly string[]) => {
      const localEdgeConfig =
        (await getInMemoryEdgeConfig()) ||
        (await getFileSystemEdgeConfig(connection));

      if (localEdgeConfig) {
        // We need to return a clone of the value so users can't modify
        // our original value, and so the reference changes.
        //
        // This makes it consistent with the real API.
        return keys.map((key) => localEdgeConfig.items[key]);
      }

      // if a getAll() is already in flight or resolved, we don't need to
      // kick off a new get()
      const allItemsPromise = getAllMap.get('#');
      if (allItemsPromise) {
        try {
          const allItems = await allItemsPromise;
          return keys.map((key) => allItems[key]);
        } catch {
          /* ignored */
        }
      }

      if (keys.length === 1) {
        const key = keys[0];
        return Promise.all([
          fetchWithHttpCache(`${baseUrl}/item/${key}?version=${version}`, {
            headers: new Headers(headers),
            cache: 'no-store',
          }).then(
            async (res) => {
              if (res.ok) return res.json();
              await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

              if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
              if (res.status === 404) {
                // if the x-edge-config-digest header is present, it means
                // the edge config exists, but the item does not
                if (res.headers.has('x-edge-config-digest')) return undefined;
                // if the x-edge-config-digest header is not present, it means
                // the edge config itself does not exist
                throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
              }
              if (res.cachedResponseBody !== undefined)
                return res.cachedResponseBody;
              throw new Error(ERRORS.UNEXPECTED);
            },
            (error) => {
              if (isDynamicServerError(error)) throw error;
              throw new Error(ERRORS.NETWORK);
            },
          ),
        ]);
      }

      const search = new URLSearchParams(
        // sort keys to improve chance of ETag cache hits
        [...keys].sort().map((key) => ['key', key] as [string, string]),
      ).toString();

      const edgeConfigItems = (await fetchWithHttpCache(
        `${baseUrl}/items?version=${version}&${search}`,
        {
          headers: new Headers(headers),
          cache: 'no-store',
        },
      ).then(
        async (res) => {
          if (res.ok) return res.json();
          await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

          if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
          // the /items endpoint never returns 404, so if we get a 404
          // it means the edge config itself did not exist
          if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
          if (res.cachedResponseBody !== undefined)
            return res.cachedResponseBody;
          throw new Error(ERRORS.UNEXPECTED);
        },
        (error) => {
          if (isDynamicServerError(error)) throw error;
          throw new Error(ERRORS.NETWORK);
        },
      )) as EdgeConfigItems;

      return keys.map((key) => edgeConfigItems[key]);
    },
    { batchScheduleFn, cacheMap: getMap },
  );

  const digestLoader = new DataLoader(
    async (keys: readonly string[]) => {
      // as every edge config has a single digest only, we use # as the key
      // to load them
      if (keys.length !== 1 || keys[0] !== '#') {
        throw new Error('unexpected key passed to digest');
      }

      const localEdgeConfig =
        (await getInMemoryEdgeConfig()) ||
        (await getFileSystemEdgeConfig(connection));

      return Promise.all(
        keys.map((_key) => {
          if (localEdgeConfig) {
            return localEdgeConfig.digest;
          }

          return fetchWithHttpCache(`${baseUrl}/digest?version=${version}`, {
            headers: new Headers(headers),
            cache: 'no-store',
          }).then(
            async (res) => {
              if (res.ok) return res.json() as Promise<string>;
              await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

              if (res.cachedResponseBody !== undefined)
                return res.cachedResponseBody as string;
              throw new Error(ERRORS.UNEXPECTED);
            },
            (error) => {
              if (isDynamicServerError(error)) throw error;
              throw new Error(ERRORS.NETWORK);
            },
          );
        }),
      );
    },
    { batchScheduleFn },
  );

  return {
    get: getLoader,
    getAll: getAllLoader,
    has: hasLoader,
    digest: digestLoader,
  };
}
