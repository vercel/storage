import { name as sdkName, version as sdkVersion } from '../package.json';
import {
  assertIsKey,
  assertIsKeys,
  clone,
  parseConnectionString,
} from './utils';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
import { swr } from './utils/swr-fn';
import { createLoaders } from './utils/create-loaders';

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

interface EdgeConfigClientOptions {
  /**
   * The stale-if-error response directive indicates that the cache can reuse a
   * stale response when an upstream server generates an error, or when the error
   * is generated locally - for example due to a connection error.
   *
   * Any response with a status code of 500, 502, 503, or 504 is considered an error.
   *
   * Pass a negative number, 0, or false to turn disable stale-if-error semantics.
   *
   * The time is supplied in seconds. Defaults to one week (`604800`).
   */
  staleIfError?: number | false;
}

interface RequestContextStore {
  get: () => RequestContext;
}

interface RequestContext {
  headers: Record<string, string | undefined>;
  url: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

type Loaders = ReturnType<typeof createLoaders>;

function getLoadersInstance(
  options: Parameters<typeof createLoaders>[0],
  cacheMap: WeakMap<RequestContext, Loaders>,
): ReturnType<typeof createLoaders> {
  const requestContextStore =
    // @ts-expect-error -- this is a vercel primitive which might or might not be defined
    globalThis[Symbol.for('@vercel/request-context')] as
      | RequestContextStore
      | undefined;

  const requestContext = requestContextStore?.get();

  // if we have requestContext we can use dataloader to cache and batch per request
  if (requestContext) {
    const cachedLoaders = cacheMap.get(requestContext);
    if (cachedLoaders) {
      return cachedLoaders;
    }

    const loaders = createLoaders(options);
    cacheMap.set(requestContext, loaders);
    return loaders;
  }

  // there is no requestConext so we can not cache loader instances per request,
  // so we return a new instance every time effectively disabling dataloader
  // batching and caching
  return createLoaders(options);
}

/**
 * Create an Edge Config client.
 *
 * The client has multiple methods which allow you to read the Edge Config.
 *
 * If you need to programmatically write to an Edge Config, check out the [Update your Edge Config items](https://vercel.com/docs/storage/edge-config/vercel-api#update-your-edge-config-items) section.
 *
 * @param connectionString - A connection string. Usually you'd pass in `process.env.EDGE_CONFIG` here, which contains a connection string.
 * @returns An Edge Config Client instance
 */
export function createClient(
  connectionString: string | undefined,
  options: EdgeConfigClientOptions = { staleIfError: 604800 /* one week */ },
): EdgeConfigClient {
  if (!connectionString)
    throw new Error('@vercel/edge-config: No connection string provided');

  const connection = parseConnectionString(connectionString);

  if (!connection)
    throw new Error('@vercel/edge-config: Invalid connection string provided');

  const loaderOptions: Parameters<typeof getLoadersInstance>[0] = {
    connection,
    sdkName,
    sdkVersion,
    staleIfError: options.staleIfError,
  };

  const loadersCacheMap = new WeakMap<RequestContext, Loaders>();

  /**
   * While in development we use SWR-like behavior for the api client to
   * reduce latency.
   */
  const shouldUseSwr =
    process.env.NODE_ENV === 'development' &&
    process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR !== '1';

  const api: Omit<EdgeConfigClient, 'connection'> = {
    async get<T = EdgeConfigValue>(key: string): Promise<T | undefined> {
      assertIsKey(key);
      const loaders = getLoadersInstance(loaderOptions, loadersCacheMap);
      return loaders.get.load(key).then((value) => {
        // prime has()
        loaders.has.prime(key, true);
        return clone(value);
      }) as Promise<T>;
    },
    async has(key): Promise<boolean> {
      assertIsKey(key);
      const loaders = getLoadersInstance(loaderOptions, loadersCacheMap);
      // this is a HEAD request anyhow, no need for fetchWithCachedResponse
      return loaders.has.load(key).then(clone);
    },
    async getAll<T = EdgeConfigItems>(keys?: (keyof T)[]): Promise<T> {
      const loaders = getLoadersInstance(loaderOptions, loadersCacheMap);
      if (keys === undefined) {
        const items = (await loaders.getAll
          .load('#')
          .then(clone)) as Promise<T>;

        // prime get() calls with the result of getAll()
        Object.entries(items).forEach(([key, value]) => {
          loaders.get.prime(key, value);
          loaders.has.prime(key, true);
        });

        return items;
      }

      assertIsKeys(keys);
      const values = await loaders.get.loadMany(keys);

      return clone(
        keys.reduce<T>((acc, key, index) => {
          acc[key] = values[index] as T[keyof T];
          return acc;
        }, {} as T),
      );
    },
    async digest(): Promise<string> {
      const loaders = getLoadersInstance(loaderOptions, loadersCacheMap);
      return loaders.digest.load('#').then(clone);
    },
  };

  return shouldUseSwr
    ? {
        connection,
        get: swr(api.get),
        getAll: swr(api.getAll),
        has: swr(api.has),
        digest: swr(api.digest),
      }
    : { ...api, connection };
}

let defaultEdgeConfigClient: EdgeConfigClient;

// lazy init fn so the default edge config does not throw in case
// process.env.EDGE_CONFIG is not defined and its methods are never used.
function init(): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- [@vercel/style-guide@5 migration]
  if (!defaultEdgeConfigClient) {
    defaultEdgeConfigClient = createClient(process.env.EDGE_CONFIG);
  }
}

/**
 * Reads a single item from the default Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).get()`.
 *
 * @see {@link EdgeConfigClient.get}
 * @param key - the key to read
 * @returns the value stored under the given key, or undefined
 */
export const get: EdgeConfigClient['get'] = (...args) => {
  init();
  return defaultEdgeConfigClient.get(...args);
};

/**
 * Reads multiple or all values.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).getAll()`.
 *
 * @see {@link EdgeConfigClient.getAll}
 * @param keys - the keys to read
 * @returns the value stored under the given key, or undefined
 */
export const getAll: EdgeConfigClient['getAll'] = (...args) => {
  init();
  return defaultEdgeConfigClient.getAll(...args);
};

/**
 * Check if a given key exists in the Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).has()`.
 *
 * @see {@link EdgeConfigClient.has}
 * @param key - the key to check
 * @returns true if the given key exists in the Edge Config.
 */
export const has: EdgeConfigClient['has'] = (...args) => {
  init();
  return defaultEdgeConfigClient.has(...args);
};

/**
 * Get the digest of the Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).digest()`.
 *
 * @see {@link EdgeConfigClient.digest}
 * @returns The digest of the Edge Config.
 */
export const digest: EdgeConfigClient['digest'] = (...args) => {
  init();
  return defaultEdgeConfigClient.digest(...args);
};
