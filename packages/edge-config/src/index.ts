import { assertIsKey, isEmptyKey } from './utils';
import { parseConnectionString } from './utils/connection';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
  EdgeConfigFunctionsOptions,
  EdgeConfigClientOptions,
  CacheStatus,
} from './types';
import { trace } from './utils/tracing';
import { Controller } from './controller';
import { OriginProvider } from './providers/origin';
import { SimpleCacheProvider } from './providers/simple-cache';
import { NetworkClient } from './utils/network-client';

export { setTracerProvider } from './utils/tracing';
export { ERRORS, UnexpectedNetworkError } from './utils/errors';

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

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
export const createClient = trace(
  function createClient(
    connectionString: string | undefined,
    options: EdgeConfigClientOptions = {
      /**
       * Allows a stored response that is stale for N seconds to be served
       * in case of an error.
       */
      staleIfError: true,
      /**
       * Allows a stored response that is stale for N seconds to be served
       * while a background refresh is performed to get the latest value.
       *
       * If the threshold is exceeded a blocking read will be performed.
       */
      maxStale: 60,
      cache: 'no-store',
    },
  ): EdgeConfigClient {
    if (!connectionString)
      throw new Error('@vercel/edge-config: No connection string provided');

    const connection = parseConnectionString(connectionString);

    if (!connection)
      throw new Error(
        '@vercel/edge-config: Invalid connection string provided',
      );

    /**
     * While in development, stream updates from the Edge Config.
     */
    const shouldUseDevelopmentStream =
      !options.disableDevelopmentStream &&
      process.env.NODE_ENV === 'development' &&
      process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_STREAM !== '1';

    const controller = new Controller(connection, {
      ...options,
      enableStream: shouldUseDevelopmentStream,
    });

    const edgeConfigId = connection.id;

    const networkClient = new NetworkClient(
      connection,
      options.cache || 'no-store',
    );

    const origin = new OriginProvider(networkClient);
    const provider = new SimpleCacheProvider(origin);

    const methods: Pick<
      EdgeConfigClient,
      'get' | 'has' | 'getMany' | 'getAll'
    > = {
      get: trace(
        async function get<T extends EdgeConfigValue = EdgeConfigValue>(
          key: string,
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<
          | T
          | undefined
          | { value: T | undefined; digest: string; cache: CacheStatus }
        > {
          assertIsKey(key);
          if (isEmptyKey(key)) {
            throw new Error('@vercel/edge-config: Can not read empty key');
          }
          const data = await controller.get<T>(key, localOptions);
          return localOptions?.metadata
            ? { value: data.value, digest: data.digest, cache: data.cache }
            : data.value;
        },
        { name: 'get', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      has: trace(
        async function has(
          key: string,
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<
          boolean | { exists: boolean; digest: string; cache: CacheStatus }
        > {
          assertIsKey(key);
          if (isEmptyKey(key)) {
            throw new Error('@vercel/edge-config: Can not read empty key');
          }

          const data = await controller.has(key, localOptions);
          return localOptions?.metadata
            ? {
                exists: data.exists,
                digest: data.digest,
                cache: data.cache,
              }
            : data.exists;
        },
        { name: 'has', isVerboseTrace: false, attributes: { edgeConfigId } },
      ) as EdgeConfigClient['has'],
      getMany: trace(
        async function getMany<T extends EdgeConfigItems>(
          keys: (keyof T)[],
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<{ value: T; digest: string; cache: CacheStatus } | T> {
          // bypass when called without valid keys and without needing metadata
          if (
            keys.every((k) => typeof k === 'string' && k.trim().length === 0) &&
            !localOptions?.metadata
          )
            return {} as T;

          const data = await controller.getMany<T>(
            keys as string[],
            localOptions,
          );
          return localOptions?.metadata
            ? {
                value: data.value,
                digest: data.digest,
                cache: data.cache,
              }
            : data.value;
        },
        {
          name: 'getMany',
          isVerboseTrace: false,
          attributes: { edgeConfigId },
        },
      ),
      getAll: trace(
        async function getAll<T extends EdgeConfigItems = EdgeConfigItems>(
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<{ value: T; digest: string; cache: CacheStatus } | T> {
          const data = await controller.getAll<T>(localOptions);
          return localOptions?.metadata
            ? {
                value: data.value,
                digest: data.digest,
                cache: data.cache,
              }
            : data.value;
        },
        { name: 'all', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
    };

    return { ...methods, connection };
  },
  {
    name: 'createClient',
  },
);

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
 * Reads all items from the default Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).getAll()`.
 *
 * @see {@link EdgeConfigClient.all}
 */
export const getAll: EdgeConfigClient['getAll'] = (...args) => {
  init();
  return defaultEdgeConfigClient.getAll(...args);
};

/**
 * Reads multiple items from the default Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).getMany()`.
 *
 * @see {@link EdgeConfigClient.getMany}
 * @param keys - the keys to read
 * @returns the values stored under the given keys, or undefined
 */
export const getMany: EdgeConfigClient['getMany'] = (...args) => {
  init();
  return defaultEdgeConfigClient.getMany(...args);
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
export const has = ((...args: Parameters<EdgeConfigClient['has']>) => {
  init();
  return defaultEdgeConfigClient.has(...args);
}) as EdgeConfigClient['has'];

/**
 * Safely clones a read-only Edge Config object and makes it mutable.
 */
export function clone<T = EdgeConfigValue>(edgeConfigValue: T): T {
  // Use JSON.parse and JSON.stringify instead of anything else due to
  // the value possibly being a Proxy object.
  return JSON.parse(JSON.stringify(edgeConfigValue)) as T;
}
