import { name as sdkName, version as sdkVersion } from '../package.json';
import type * as deps from './edge-config';
import type {
  EdgeConfigClient,
  EdgeConfigFunctionsOptions,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
import {
  assertIsKey,
  assertIsKeys,
  // biome-ignore lint/suspicious/noShadowRestrictedNames: ok
  hasOwnProperty,
  isEmptyKey,
  parseConnectionString,
  pick,
} from './utils';
import { trace } from './utils/tracing';

type CreateClient = (
  connectionString: string | undefined,
  options?: deps.EdgeConfigClientOptions,
) => EdgeConfigClient;

export function createCreateClient({
  getInMemoryEdgeConfig,
  getLocalEdgeConfig,
  fetchEdgeConfigItem,
  fetchEdgeConfigHas,
  fetchAllEdgeConfigItem,
  fetchEdgeConfigTrace,
}: {
  getInMemoryEdgeConfig: typeof deps.getInMemoryEdgeConfig;
  getLocalEdgeConfig: typeof deps.getLocalEdgeConfig;
  fetchEdgeConfigItem: typeof deps.fetchEdgeConfigItem;
  fetchEdgeConfigHas: typeof deps.fetchEdgeConfigHas;
  fetchAllEdgeConfigItem: typeof deps.fetchAllEdgeConfigItem;
  fetchEdgeConfigTrace: typeof deps.fetchEdgeConfigTrace;
}): CreateClient {
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
  return trace(
    function createClient(
      connectionString,
      options = {
        staleIfError: 604800 /* one week */,
        cache: 'no-store',
      },
    ): deps.EdgeConfigClient {
      if (!connectionString)
        throw new Error('@vercel/edge-config: No connection string provided');

      const connection = parseConnectionString(connectionString);

      if (!connection)
        throw new Error(
          '@vercel/edge-config: Invalid connection string provided',
        );

      const edgeConfigId = connection.id;
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

      const api: Omit<deps.EdgeConfigClient, 'connection'> = {
        get: trace(
          async function get<T = EdgeConfigValue>(
            key: string,
            localOptions?: EdgeConfigFunctionsOptions,
          ): Promise<T | undefined> {
            assertIsKey(key);

            let localEdgeConfig: EmbeddedEdgeConfig | null = null;
            if (localOptions?.consistentRead) {
              // fall through to fetching
            } else if (shouldUseDevelopmentCache) {
              localEdgeConfig = await getInMemoryEdgeConfig(
                connectionString,
                fetchCache,
                options.staleIfError,
              );
            } else {
              localEdgeConfig = await getLocalEdgeConfig(
                connection.type,
                connection.id,
                fetchCache,
              );
            }

            if (localEdgeConfig) {
              if (isEmptyKey(key)) return undefined;
              // We need to return a clone of the value so users can't modify
              // our original value, and so the reference changes.
              //
              // This makes it consistent with the real API.
              return Promise.resolve(localEdgeConfig.items[key] as T);
            }

            return fetchEdgeConfigItem<T>(
              baseUrl,
              key,
              version,
              localOptions?.consistentRead,
              headers,
              fetchCache,
            );
          },
          { name: 'get', isVerboseTrace: false, attributes: { edgeConfigId } },
        ),
        has: trace(
          async function has(
            key,
            localOptions?: EdgeConfigFunctionsOptions,
          ): Promise<boolean> {
            assertIsKey(key);
            if (isEmptyKey(key)) return false;

            let localEdgeConfig: EmbeddedEdgeConfig | null = null;

            if (localOptions?.consistentRead) {
              // fall through to fetching
            } else if (shouldUseDevelopmentCache) {
              localEdgeConfig = await getInMemoryEdgeConfig(
                connectionString,
                fetchCache,
                options.staleIfError,
              );
            } else {
              localEdgeConfig = await getLocalEdgeConfig(
                connection.type,
                connection.id,
                fetchCache,
              );
            }

            if (localEdgeConfig) {
              return Promise.resolve(
                hasOwnProperty(localEdgeConfig.items, key),
              );
            }

            return fetchEdgeConfigHas(
              baseUrl,
              key,
              version,
              localOptions?.consistentRead,
              headers,
              fetchCache,
            );
          },
          { name: 'has', isVerboseTrace: false, attributes: { edgeConfigId } },
        ),
        getAll: trace(
          async function getAll<T = EdgeConfigItems>(
            keys?: (keyof T)[],
            localOptions?: EdgeConfigFunctionsOptions,
          ): Promise<T> {
            if (keys) {
              assertIsKeys(keys);
            }

            let localEdgeConfig: EmbeddedEdgeConfig | null = null;

            if (localOptions?.consistentRead) {
              // fall through to fetching
            } else if (shouldUseDevelopmentCache) {
              localEdgeConfig = await getInMemoryEdgeConfig(
                connectionString,
                fetchCache,
                options.staleIfError,
              );
            } else {
              localEdgeConfig = await getLocalEdgeConfig(
                connection.type,
                connection.id,
                fetchCache,
              );
            }

            if (localEdgeConfig) {
              if (keys === undefined) {
                return Promise.resolve(localEdgeConfig.items as T);
              }

              return Promise.resolve(pick(localEdgeConfig.items, keys) as T);
            }

            return fetchAllEdgeConfigItem<T>(
              baseUrl,
              keys,
              version,
              localOptions?.consistentRead,
              headers,
              fetchCache,
            );
          },
          {
            name: 'getAll',
            isVerboseTrace: false,
            attributes: { edgeConfigId },
          },
        ),
        digest: trace(
          async function digest(
            localOptions?: EdgeConfigFunctionsOptions,
          ): Promise<string> {
            let localEdgeConfig: EmbeddedEdgeConfig | null = null;

            if (localOptions?.consistentRead) {
              // fall through to fetching
            } else if (shouldUseDevelopmentCache) {
              localEdgeConfig = await getInMemoryEdgeConfig(
                connectionString,
                fetchCache,
                options.staleIfError,
              );
            } else {
              localEdgeConfig = await getLocalEdgeConfig(
                connection.type,
                connection.id,
                fetchCache,
              );
            }

            if (localEdgeConfig) {
              return Promise.resolve(localEdgeConfig.digest);
            }

            return fetchEdgeConfigTrace(
              baseUrl,
              version,
              localOptions?.consistentRead,
              headers,
              fetchCache,
            );
          },
          {
            name: 'digest',
            isVerboseTrace: false,
            attributes: { edgeConfigId },
          },
        ),
      };

      return { ...api, connection };
    },
    {
      name: 'createClient',
    },
  );
}
