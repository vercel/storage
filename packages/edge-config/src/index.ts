import { name as sdkName, version as sdkVersion } from '../package.json';
import {
  assertIsKey,
  isEmptyKey,
  ERRORS,
  UnexpectedNetworkError,
  parseConnectionString,
} from './utils';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
  EdgeConfigFunctionsOptions,
  EdgeConfigClientOptions,
} from './types';
// import { fetch } from './utils/enhanced-fetch';
import { trace } from './utils/tracing';
import { consumeResponseBody } from './utils/consume-response-body';
import { addConsistentReadHeader } from './utils/add-consistent-read-header';
import { Controller } from './controller';

export { setTracerProvider } from './utils/tracing';

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
      staleIfError: 604800 /* one week */,
      staleThreshold: 60 /* 1 minute */,
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

    if (typeof options.staleIfError === 'number' && options.staleIfError > 0)
      headers['cache-control'] = `stale-if-error=${options.staleIfError}`;

    const fetchCache = options.cache || 'no-store';

    /**
     * While in development we use SWR-like behavior for the api client to
     * reduce latency.
     */
    const shouldUseDevelopmentCache =
      !options.disableDevelopmentCache &&
      process.env.NODE_ENV === 'development' &&
      process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR !== '1';

    const controller = new Controller(
      connection,
      options,
      shouldUseDevelopmentCache,
    );

    const edgeConfigId = connection.id;

    const methods: Pick<
      EdgeConfigClient,
      'get' | 'has' | 'getMultiple' | 'getAll' | 'digest'
    > = {
      get: trace(
        async function get<T = EdgeConfigValue>(
          key: string,
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<T | undefined | { value: T | undefined; digest: string }> {
          assertIsKey(key);
          if (isEmptyKey(key)) {
            throw new Error('@vercel/edge-config: Can not read empty key');
          }
          const data = await controller.get<T>(key, localOptions);
          return localOptions?.metadata ? data : data.value;
        },
        { name: 'get', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      has: trace(
        async function has(
          key: string,
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<boolean | { exists: boolean; digest: string }> {
          assertIsKey(key);
          if (isEmptyKey(key)) {
            throw new Error('@vercel/edge-config: Can not read empty key');
          }

          const data = await controller.has(key, localOptions);
          return localOptions?.metadata ? data : data.exists;
        },
        { name: 'has', isVerboseTrace: false, attributes: { edgeConfigId } },
      ) as EdgeConfigClient['has'],
      getMultiple: trace(
        async function getMultiple<T>(
          keys: (keyof T)[],
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<{ value: T; digest: string } | T> {
          const data = await controller.getMultiple<T>(keys, localOptions);
          return localOptions?.metadata ? data : data.value;
        },
        {
          name: 'getMultiple',
          isVerboseTrace: false,
          attributes: { edgeConfigId },
        },
      ),
      getAll: trace(
        async function getAll<T = EdgeConfigItems>(
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<{ value: T; digest: string } | T> {
          const data = await controller.getAll<T>(localOptions);
          return localOptions?.metadata ? data : data.value;
        },
        { name: 'getAll', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      digest: trace(
        async function digest(
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<string> {
          const localHeaders = new Headers(headers);
          if (localOptions?.consistentRead)
            addConsistentReadHeader(localHeaders);

          return fetch(`${baseUrl}/digest?version=${version}`, {
            headers: localHeaders,
            cache: fetchCache,
          }).then(async (res) => {
            if (res.ok) return res.json() as Promise<string>;
            await consumeResponseBody(res);

            // if (res.cachedResponseBody !== undefined)
            //   return res.cachedResponseBody as string;
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'digest', isVerboseTrace: false, attributes: { edgeConfigId } },
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

/**
 * Safely clones a read-only Edge Config object and makes it mutable.
 */
export function clone<T = EdgeConfigValue>(edgeConfigValue: T): T {
  // Use JSON.parse and JSON.stringify instead of anything else due to
  // the value possibly being a Proxy object.
  return JSON.parse(JSON.stringify(edgeConfigValue)) as T;
}
