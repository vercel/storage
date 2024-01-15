import { readFile } from '@vercel/edge-config-fs';
import { name as sdkName, version as sdkVersion } from '../package.json';
import {
  assertIsKey,
  assertIsKeys,
  clone,
  ERRORS,
  UnexpectedNetworkError,
  hasOwnProperty,
  parseConnectionString,
  pick,
} from './utils';
import type {
  Connection,
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
import { fetchWithCachedResponse } from './utils/fetch-with-cached-response';
import { swr } from './utils/swr-fn';
import { trace } from './utils/tracing';

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

const jsonParseCache = new Map<string, unknown>();

const readFileTraced = trace(readFile, { name: 'readFile' });
const jsonParseTraced = trace(JSON.parse, { name: 'JSON.parse' });

const cachedJsonParseTraced = trace(
  (edgeConfigId: string, content: string) => {
    const cached = jsonParseCache.get(edgeConfigId);
    if (cached) return cached;

    const parsed = jsonParseTraced(content) as unknown;

    // freeze the object to avoid mutations of the return value of a "get" call
    // from affecting the return value of future "get" calls
    jsonParseCache.set(edgeConfigId, Object.freeze(parsed));
    return parsed;
  },
  { name: 'cached JSON.parse' },
);

/**
 * Reads an Edge Config from the local file system.
 * This is used at runtime on serverless functions.
 */
const getFileSystemEdgeConfig = trace(
  async function getFileSystemEdgeConfig(
    connection: Connection,
  ): Promise<EmbeddedEdgeConfig | null> {
    // can't optimize non-vercel hosted edge configs
    if (connection.type !== 'vercel') return null;
    // can't use fs optimizations outside of lambda
    if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return null;

    try {
      const content = await readFileTraced(
        `/opt/edge-config/${connection.id}.json`,
        'utf-8',
      );

      return cachedJsonParseTraced(
        connection.id,
        content,
      ) as EmbeddedEdgeConfig;
    } catch {
      return null;
    }
  },
  {
    name: 'getFileSystemEdgeConfig',
  },
);

async function consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(
  res: Response,
): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined') return;

  // Read body to avoid memory leaks in nodejs
  // see https://github.com/nodejs/undici/blob/v5.21.2/README.md#garbage-collection
  // see https://github.com/node-fetch/node-fetch/issues/83
  await res.arrayBuffer();
}

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
export const createClient = trace(
  function createClient(
    connectionString: string | undefined,
    options: EdgeConfigClientOptions = { staleIfError: 604800 /* one week */ },
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

    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- [@vercel/style-guide@5 migration]
    if (typeof process !== 'undefined' && process.env.VERCEL_ENV)
      headers['x-edge-config-vercel-env'] = process.env.VERCEL_ENV;

    if (typeof sdkName === 'string' && typeof sdkVersion === 'string')
      headers['x-edge-config-sdk'] = `${sdkName}@${sdkVersion}`;

    if (typeof options.staleIfError === 'number' && options.staleIfError > 0)
      headers['cache-control'] = `stale-if-error=${options.staleIfError}`;

    /**
     * While in development we use SWR-like behavior for the api client to
     * reduce latency.
     */
    const shouldUseSwr =
      !options.disableDevelopmentCache &&
      process.env.NODE_ENV === 'development' &&
      process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR !== '1';

    const api: Omit<EdgeConfigClient, 'connection'> = {
      get: trace(
        async function get<T = EdgeConfigValue>(
          key: string,
        ): Promise<T | undefined> {
          const localEdgeConfig = await getFileSystemEdgeConfig(connection);

          if (localEdgeConfig) {
            assertIsKey(key);

            // We need to return a clone of the value so users can't modify
            // our original value, and so the reference changes.
            //
            // This makes it consistent with the real API.
            return Promise.resolve(clone(localEdgeConfig.items[key]) as T);
          }

          assertIsKey(key);
          return fetchWithCachedResponse(
            `${baseUrl}/item/${key}?version=${version}`,
            {
              headers: new Headers(headers),
              cache: 'no-store',
            },
          ).then<T | undefined, undefined>(async (res) => {
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
              return res.cachedResponseBody as T;
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'get', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      has: trace(
        async function has(key): Promise<boolean> {
          const localEdgeConfig = await getFileSystemEdgeConfig(connection);

          if (localEdgeConfig) {
            assertIsKey(key);
            return Promise.resolve(hasOwnProperty(localEdgeConfig.items, key));
          }

          assertIsKey(key);
          // this is a HEAD request anyhow, no need for fetchWithCachedResponse
          return fetch(`${baseUrl}/item/${key}?version=${version}`, {
            method: 'HEAD',
            headers: new Headers(headers),
            cache: 'no-store',
          }).then((res) => {
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
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'has', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      getAll: trace(
        async function getAll<T = EdgeConfigItems>(
          keys?: (keyof T)[],
        ): Promise<T> {
          const localEdgeConfig = await getFileSystemEdgeConfig(connection);

          if (localEdgeConfig) {
            if (keys === undefined) {
              return Promise.resolve(clone(localEdgeConfig.items) as T);
            }

            assertIsKeys(keys);
            return Promise.resolve(
              clone(pick(localEdgeConfig.items, keys)) as T,
            );
          }

          if (Array.isArray(keys)) assertIsKeys(keys);

          const search = Array.isArray(keys)
            ? new URLSearchParams(
                keys.map((key) => ['key', key] as [string, string]),
              ).toString()
            : null;

          // empty search keys array was given,
          // so skip the request and return an empty object
          if (search === '') return Promise.resolve({} as T);

          return fetchWithCachedResponse(
            `${baseUrl}/items?version=${version}${
              search === null ? '' : `&${search}`
            }`,
            {
              headers: new Headers(headers),
              cache: 'no-store',
            },
          ).then<T>(async (res) => {
            if (res.ok) return res.json();
            await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

            if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
            // the /items endpoint never returns 404, so if we get a 404
            // it means the edge config itself did not exist
            if (res.status === 404)
              throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
            if (res.cachedResponseBody !== undefined)
              return res.cachedResponseBody as T;
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'getAll', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      digest: trace(
        async function digest(): Promise<string> {
          const localEdgeConfig = await getFileSystemEdgeConfig(connection);

          if (localEdgeConfig) {
            return Promise.resolve(localEdgeConfig.digest);
          }

          return fetchWithCachedResponse(
            `${baseUrl}/digest?version=${version}`,
            {
              headers: new Headers(headers),
              cache: 'no-store',
            },
          ).then(async (res) => {
            if (res.ok) return res.json() as Promise<string>;
            await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

            if (res.cachedResponseBody !== undefined)
              return res.cachedResponseBody as string;
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'digest', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
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
