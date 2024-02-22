import { readFile } from '@vercel/edge-config-fs';
import type { DeepReadonly, DeepWritable } from 'ts-essentials';
import { name as sdkName, version as sdkVersion } from '../package.json';
import {
  assertIsKey,
  assertIsKeys,
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
import { trace } from './utils/tracing';

export { setTracer } from './utils/tracing';

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

const privateEdgeConfigSymbol = Symbol.for('privateEdgeConfig');

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

/**
 * Will return an embedded Edge Config object from memory,
 * but only when the `privateEdgeConfigSymbol` is in global scope.
 */
const getPrivateEdgeConfig = trace(
  async function getPrivateEdgeConfig(
    connection: Connection,
  ): Promise<DeepReadonly<EmbeddedEdgeConfig> | null> {
    const privateEdgeConfig = Reflect.get(
      globalThis,
      privateEdgeConfigSymbol,
    ) as
      | {
          get: (id: string) => Promise<DeepReadonly<EmbeddedEdgeConfig> | null>;
        }
      | undefined;

    if (
      typeof privateEdgeConfig === 'object' &&
      typeof privateEdgeConfig.get === 'function'
    ) {
      return privateEdgeConfig.get(connection.id);
    }

    return null;
  },
  {
    name: 'getPrivateEdgeConfig',
  },
);

/**
 * Returns a function to retrieve the entire Edge Config.
 * It'll keep the fetched Edge Config in memory, making subsequent calls fast,
 * while revalidating in the background.
 */
function createGetInMemoryEdgeConfig(
  shouldUseDevelopmentCache: boolean,
  connection: Connection,
  headers: Record<string, string>,
): () => Promise<EmbeddedEdgeConfig | null> {
  // Functions as cache to keep track of the Edge Config.
  let embeddedEdgeConfigPromise: Promise<EmbeddedEdgeConfig | null> | null =
    null;

  // Promise that points to the most recent request.
  // It'll ensure that subsequent calls won't make another fetch call,
  // while one is still on-going.
  // Will overwrite `embeddedEdgeConfigPromise` only when resolved.
  let latestRequest: Promise<EmbeddedEdgeConfig | null> | null = null;

  return trace(
    async () => {
      if (!shouldUseDevelopmentCache) return null;

      latestRequest ??= fetchWithCachedResponse(
        `${connection.baseUrl}/items?version=${connection.version}`,
        {
          headers: new Headers(headers),
          cache: 'no-store',
        },
      ).then(async (res) => {
        const digest = res.headers.get('x-edge-config-digest');
        let body: EdgeConfigValue | undefined;

        // We ignore all errors here and just proceed.
        if (!res.ok) {
          await consumeResponseBody(res);
          body = res.cachedResponseBody as EdgeConfigValue | undefined;
          if (!body) return null;
        } else {
          body = (await res.json()) as EdgeConfigItems;
        }

        return { digest, items: body } as EmbeddedEdgeConfig;
      });

      // Ensures that the last request will overwrite the `embeddedEdgeConfigPromise`
      // and clean up the `lastRequest` cache to make sure the next call
      // will trigger a new request.
      void latestRequest
        .then((resolved) => {
          embeddedEdgeConfigPromise = Promise.resolve(resolved);
        })
        .finally(() => {
          latestRequest = null;
        });

      embeddedEdgeConfigPromise ??= latestRequest;

      // Ensure we don't keep a rejected promise in memory
      embeddedEdgeConfigPromise.catch(() => {
        embeddedEdgeConfigPromise = null;
      });

      return embeddedEdgeConfigPromise;
    },
    {
      name: 'getInMemoryEdgeConfig',
    },
  );
}

/**
 *
 */
async function getLocalEdgeConfig(
  connection: Connection,
): Promise<DeepReadonly<EmbeddedEdgeConfig> | null> {
  const edgeConfig =
    (await getPrivateEdgeConfig(connection)) ||
    (await getFileSystemEdgeConfig(connection));

  return edgeConfig;
}

/**
 * This function reads the respone body
 *
 * Reading the response body serves two purposes
 *
 * 1) In Node.js it avoids memory leaks
 *
 * See https://github.com/nodejs/undici/blob/v5.21.2/README.md#garbage-collection
 * See https://github.com/node-fetch/node-fetch/issues/83
 *
 * 2) In Cloudflare it avoids running into a deadlock. They have a maximum number
 * of concurrent fetches (which is documented). Concurrency counts until the
 * body of a response is read. It is not uncommon to never read a response body
 * (e.g. if you only care about the status code). This can lead to deadlock as
 * fetches appear to never resolve.
 *
 * See https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections
 */
async function consumeResponseBody(res: Response): Promise<void> {
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
    const shouldUseDevelopmentCache =
      !options.disableDevelopmentCache &&
      process.env.NODE_ENV === 'development' &&
      process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR !== '1';

    const getInMemoryEdgeConfig = createGetInMemoryEdgeConfig(
      shouldUseDevelopmentCache,
      connection,
      headers,
    );

    const api: Omit<EdgeConfigClient, 'connection'> = {
      get: trace(
        async function get<T = EdgeConfigValue>(
          key: string,
        ): Promise<DeepReadonly<T> | undefined> {
          const localEdgeConfig =
            (await getInMemoryEdgeConfig()) ||
            (await getLocalEdgeConfig(connection));

          if (localEdgeConfig) {
            assertIsKey(key);

            // We need to return a clone of the value so users can't modify
            // our original value, and so the reference changes.
            //
            // This makes it consistent with the real API.
            return Promise.resolve(
              localEdgeConfig.items[key] as DeepReadonly<T>,
            );
          }

          assertIsKey(key);
          return fetchWithCachedResponse(
            `${baseUrl}/item/${key}?version=${version}`,
            {
              headers: new Headers(headers),
              cache: 'no-store',
            },
          ).then<DeepReadonly<T> | undefined, undefined>(async (res) => {
            if (res.ok) return res.json();
            await consumeResponseBody(res);

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
              return res.cachedResponseBody as DeepReadonly<T>;
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'get', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      has: trace(
        async function has(key): Promise<boolean> {
          const localEdgeConfig =
            (await getInMemoryEdgeConfig()) ||
            (await getLocalEdgeConfig(connection));

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
        ): Promise<DeepReadonly<T>> {
          const localEdgeConfig =
            (await getInMemoryEdgeConfig()) ||
            (await getLocalEdgeConfig(connection));

          if (localEdgeConfig) {
            if (keys === undefined) {
              return Promise.resolve(localEdgeConfig.items as DeepReadonly<T>);
            }

            assertIsKeys(keys);
            return Promise.resolve(
              pick(localEdgeConfig.items, keys) as DeepReadonly<T>,
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
          if (search === '') return Promise.resolve({} as DeepReadonly<T>);

          return fetchWithCachedResponse(
            `${baseUrl}/items?version=${version}${
              search === null ? '' : `&${search}`
            }`,
            {
              headers: new Headers(headers),
              cache: 'no-store',
            },
          ).then<DeepReadonly<T>>(async (res) => {
            if (res.ok) return res.json();
            await consumeResponseBody(res);

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
          const localEdgeConfig =
            (await getInMemoryEdgeConfig()) ||
            (await getLocalEdgeConfig(connection));

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
            await consumeResponseBody(res);

            if (res.cachedResponseBody !== undefined)
              return res.cachedResponseBody as string;
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'digest', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
    };

    return { ...api, connection };
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

/**
 * Safely clones a read-only Edge Config object and makes it mutable.
 */
export function clone<T = EdgeConfigValue>(
  edgeConfigValue: T,
): DeepWritable<T> {
  // Use JSON.parse and JSON.stringify instead of anything else due to
  // the value possibly being a Proxy object.
  return JSON.parse(JSON.stringify(edgeConfigValue)) as DeepWritable<T>;
}
