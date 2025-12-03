import { name as sdkName, version as sdkVersion } from '../package.json';
import type * as deps from './edge-config';
import type {
  BundledEdgeConfig,
  EdgeConfigClient,
  EdgeConfigFunctionsOptions,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
import {
  assertIsKey,
  assertIsKeys,
  hasOwn,
  isEmptyKey,
  parseConnectionString,
  pick,
} from './utils';
import { readBundledEdgeConfig } from './utils/read-bundled-edge-config';
import { TimeoutError } from './utils/timeout-error';
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
    ): EdgeConfigClient {
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

      if (typeof process !== 'undefined' && process.env.VERCEL_ENV)
        headers['x-edge-config-vercel-env'] = process.env.VERCEL_ENV;

      if (typeof sdkName === 'string' && typeof sdkVersion === 'string')
        headers['x-edge-config-sdk'] = `${sdkName}@${sdkVersion}`;

      if (typeof options.staleIfError === 'number' && options.staleIfError > 0)
        headers['cache-control'] = `stale-if-error=${options.staleIfError}`;

      const fetchCache = options.cache || 'no-store';
      const timeoutMs =
        typeof options.timeoutMs === 'number' ? options.timeoutMs : undefined;

      /**
       * While in development we use SWR-like behavior for the api client to
       * reduce latency.
       */
      const shouldUseDevelopmentCache =
        !options.disableDevelopmentCache &&
        process.env.NODE_ENV === 'development' &&
        process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR !== '1';

      /**
       * The edge config bundled at build time
       */
      const bundledEdgeConfig: BundledEdgeConfig | null =
        connection && connection.type === 'vercel'
          ? readBundledEdgeConfig(connection.id)
          : null;

      const isBuildStep =
        process.env.CI === '1' ||
        process.env.NEXT_PHASE === 'phase-production-build';

      /**
       * Ensures that the provided function runs within a specified timeout.
       * If the timeout is reached before the function completes, it returns the fallback.
       */
      async function timeout<T>(
        method: string,
        key: string | string[] | undefined,
        localOptions: EdgeConfigFunctionsOptions | undefined,
        run: () => Promise<T>,
      ): Promise<T> {
        const ms = localOptions?.timeoutMs ?? timeoutMs;

        if (typeof ms !== 'number') return run();

        let timer: NodeJS.Timeout | undefined;
        // ensure we don't throw within race to avoid throwing after run() completes
        const result = await Promise.race([
          new Promise<TimeoutError>((resolve) => {
            timer = setTimeout(
              () => resolve(new TimeoutError(edgeConfigId, method, key)),
              ms,
            );
          }),
          run(),
        ]);
        if (result instanceof TimeoutError) throw result;
        clearTimeout(timer);
        return result;
      }

      const api: Omit<EdgeConfigClient, 'connection'> = {
        get: trace(
          async function get<T = EdgeConfigValue>(
            key: string,
            localOptions?: EdgeConfigFunctionsOptions,
          ): Promise<T | undefined> {
            assertIsKey(key);

            function select(edgeConfig: EmbeddedEdgeConfig) {
              if (isEmptyKey(key)) return undefined;
              return edgeConfig.items[key] as T;
            }

            if (bundledEdgeConfig && isBuildStep) {
              return select(bundledEdgeConfig.data);
            }

            try {
              return await timeout('get', key, localOptions, async () => {
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

                if (localEdgeConfig) return select(localEdgeConfig);

                return await fetchEdgeConfigItem<T>(
                  baseUrl,
                  key,
                  version,
                  localOptions?.consistentRead,
                  headers,
                  fetchCache,
                );
              });
            } catch (error) {
              if (!bundledEdgeConfig) throw error;
              console.warn(
                `@vercel/edge-config: Falling back to bundled version of ${edgeConfigId} due to the following error`,
                error,
              );
              return select(bundledEdgeConfig.data);
            }
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

            function select(edgeConfig: EmbeddedEdgeConfig) {
              return hasOwn(edgeConfig.items, key);
            }

            if (bundledEdgeConfig && isBuildStep) {
              return select(bundledEdgeConfig.data);
            }

            try {
              return await timeout('has', key, localOptions, async () => {
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
                  return Promise.resolve(hasOwn(localEdgeConfig.items, key));
                }

                return await fetchEdgeConfigHas(
                  baseUrl,
                  key,
                  version,
                  localOptions?.consistentRead,
                  headers,
                  fetchCache,
                );
              });
            } catch (error) {
              if (!bundledEdgeConfig) throw error;
              console.warn(
                `@vercel/edge-config: Falling back to bundled version of ${edgeConfigId} due to the following error`,
                error,
              );
              return select(bundledEdgeConfig.data);
            }
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

            function select(edgeConfig: EmbeddedEdgeConfig) {
              return keys === undefined
                ? (edgeConfig.items as T)
                : (pick(edgeConfig.items as T, keys) as T);
            }

            if (bundledEdgeConfig && isBuildStep) {
              return select(bundledEdgeConfig.data);
            }

            try {
              return await timeout('getAll', keys, localOptions, async () => {
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

                if (localEdgeConfig) return select(localEdgeConfig);

                return await fetchAllEdgeConfigItem<T>(
                  baseUrl,
                  keys,
                  version,
                  localOptions?.consistentRead,
                  headers,
                  fetchCache,
                );
              });
            } catch (error) {
              if (!bundledEdgeConfig) throw error;
              console.warn(
                `@vercel/edge-config: Falling back to bundled version of ${edgeConfigId} due to the following error`,
                error,
              );
              return select(bundledEdgeConfig.data);
            }
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
            function select(embeddedEdgeConfig: EmbeddedEdgeConfig) {
              return embeddedEdgeConfig.digest;
            }

            if (bundledEdgeConfig && isBuildStep) {
              return select(bundledEdgeConfig.data);
            }

            try {
              return await timeout(
                'digest',
                undefined,
                localOptions,
                async () => {
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

                  if (localEdgeConfig) return select(localEdgeConfig);

                  return await fetchEdgeConfigTrace(
                    baseUrl,
                    version,
                    localOptions?.consistentRead,
                    headers,
                    fetchCache,
                  );
                },
              );
            } catch (error) {
              if (!bundledEdgeConfig) throw error;
              console.warn(
                `@vercel/edge-config: Falling back to bundled version of ${edgeConfigId} due to the following error`,
                error,
              );
              return select(bundledEdgeConfig.data);
            }
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
