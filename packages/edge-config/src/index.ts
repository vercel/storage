import { name as sdkName, version as sdkVersion } from '../package.json';
import { assertIsKey, assertIsKeys, parseConnectionString } from './utils';
import { clone } from './utils/clone';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
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
  /**
   * In development, a stale-while-revalidate cache is employed as the default caching strategy.
   *
   * This cache aims to deliver speedy Edge Config reads during development, though it comes
   * at the cost of delayed visibility for updates to Edge Config. Typically, you may need to
   * refresh twice to observe these changes as the stale value is replaced.
   *
   * This cache is not used in preview or production deployments as superior optimisations are applied there.
   */
  disableDevelopmentCache?: boolean;
  /**
   * By default all Edge Config reads will be deduped and cached for duration
   * of the current request when hosted on Vercel. This ensures that reads of
   * the same key will return the same value for the duration of a request, and
   * it also reduces latency as the result will be reused.
   *
   * You can disable this by passing `disableRequestContextCache: true` which
   * will result in Edge Config being read every time.
   */
  disableRequestContextCache?: boolean;
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
  options: Parameters<typeof createLoaders>[0] & {
    disableRequestContextCache?: boolean;
  },
  loadersInstanceCache: WeakMap<RequestContext, Loaders>,
): ReturnType<typeof createLoaders> {
  if (options.disableRequestContextCache) return createLoaders(options);

  const requestContextStore =
    // @ts-expect-error -- this is a vercel primitive which might or might not be defined
    globalThis[Symbol.for('@vercel/request-context')] as
      | RequestContextStore
      | undefined;

  const requestContext = requestContextStore?.get();

  // if we have requestContext we can use dataloader to cache and batch per request
  if (requestContext) {
    const loadersInstance = loadersInstanceCache.get(requestContext);
    if (loadersInstance) return loadersInstance;

    const loaders = createLoaders(options);
    loadersInstanceCache.set(requestContext, loaders);
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
  options: EdgeConfigClientOptions = {
    staleIfError: 604800 /* one week */,
    disableRequestContextCache: false,
  },
): EdgeConfigClient {
  if (!connectionString)
    throw new Error('@vercel/edge-config: No connection string provided');

  const connection = parseConnectionString(connectionString);

  if (!connection)
    throw new Error('@vercel/edge-config: Invalid connection string provided');

  /**
   * While in development we use SWR-like behavior for the api client to
   * reduce latency.
   */
  const enableDevelopmentCache =
    !options.disableDevelopmentCache &&
    process.env.NODE_ENV === 'development' &&
    process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR !== '1';

  const loaderOptions: Parameters<typeof getLoadersInstance>[0] = {
    connection,
    sdkName,
    sdkVersion,
    staleIfError: options.staleIfError,
    inMemoryDevelopmentCache: enableDevelopmentCache ? null : undefined,
  };

  const loadersInstanceCache = new WeakMap<RequestContext, Loaders>();

  const api: Omit<EdgeConfigClient, 'connection'> = {
    async get<T = EdgeConfigValue | undefined>(key: string): Promise<T> {
      assertIsKey(key);
      const loaders = getLoadersInstance(loaderOptions, loadersInstanceCache);

      return loaders.get.load(key).then((value) => {
        // prime has() with the result of get()
        loaders.has.prime(key, value !== undefined);
        return clone(value);
      }) as Promise<T>;
    },
    async has(key): Promise<boolean> {
      assertIsKey(key);
      const loaders = getLoadersInstance(loaderOptions, loadersInstanceCache);

      return loaders.has.load(key);
    },
    async getMany<T = (EdgeConfigValue | undefined)[]>(
      keys: string[],
    ): Promise<T> {
      const loaders = getLoadersInstance(loaderOptions, loadersInstanceCache);

      assertIsKeys(keys);
      const values = await loaders.get.loadMany(keys);

      // throw error in case the edge config could not be found
      const error = values.find((v): v is Error => v instanceof Error);
      if (error) throw error;

      // prime get() and has() calls with the result of getMany()
      keys.forEach((key, index) => {
        if (!key) return;
        const value = values[index];
        loaders.get.prime(key, value);
        loaders.has.prime(key, value !== undefined);
      });

      return clone(values) as T;
    },
    async getAll<T = EdgeConfigItems>(keys?: (keyof T)[]): Promise<T> {
      const loaders = getLoadersInstance(loaderOptions, loadersInstanceCache);
      if (keys === undefined) {
        const items = await loaders.getAll.load('#').then(clone);

        // prime get() and has() calls with the result of getAll()
        Object.entries(items).forEach(([key, value]) => {
          loaders.get.prime(key, value);
          loaders.has.prime(key, true);
        });

        return items as T;
      }

      assertIsKeys(keys);
      const values = await loaders.get.loadMany(keys);

      // throw error in case the edge config could not be found
      const error = values.find((v): v is Error => v instanceof Error);
      if (error) throw error;

      return clone(
        keys.reduce<T>((acc, key, index) => {
          acc[key] = values[index] as T[keyof T];
          return acc;
        }, {} as T),
      );
    },
    async digest(): Promise<string> {
      const loaders = getLoadersInstance(loaderOptions, loadersInstanceCache);
      return loaders.digest.load('#').then(clone);
    },
  };

  return { ...api, connection };
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
 * Reads multiple values as an array.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).getMany()`.
 *
 * @see {@link EdgeConfigClient.getMany}
 * @param keys - the keys to read
 * @returns an array containing the value of each given key
 */
export const getMany: EdgeConfigClient['getMany'] = (...args) => {
  init();
  return defaultEdgeConfigClient.getMany(...args);
};

/**
 * Reads multiple or all values as a record.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).getAll()`.
 *
 * @see {@link EdgeConfigClient.getAll}
 * @param keys - the keys to read
 * @returns a subset of the Edge Config's items filtered by the given keys, or all items if no keys were provided
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
