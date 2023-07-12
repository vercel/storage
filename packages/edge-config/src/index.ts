import { readFile } from '@vercel/edge-config-fs';
import { name as sdkName, version as sdkVersion } from '../package.json';
import {
  assertIsKey,
  assertIsKeys,
  clone,
  ERRORS,
  hasOwnProperty,
  isDynamicServerError,
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

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

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
 * Parses info contained in connection strings.
 *
 * This works with the vercel-provided connection strings, but it also
 * works with custom connection strings.
 *
 * The reason we support custom connection strings is that it makes testing
 * edge config really straightforward. Users can provide  connection strings
 * pointing to their own servers and then either have a custom server
 * return the desired values or even intercept requests with something like
 * msw.
 *
 * To allow interception we need a custom connection string as the
 * edge-config.vercel.com connection string might not always go over
 * the network, so msw would not have a chance to intercept.
 */
function getConnection(connectionString: string): Connection | null {
  const isVercelConnectionString = connectionString.startsWith(
    'https://edge-config.vercel.com/',
  );

  const connection = isVercelConnectionString
    ? parseConnectionString(connectionString)
    : null;

  if (isVercelConnectionString && connection)
    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${connection.id}`,
      id: connection.id,
      version: '1',
      token: connection.token,
    };

  try {
    const url = new URL(connectionString);

    let id: string | null = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    const version = url.searchParams.get('version') || '1';

    // try to determine id based on pathname if it wasn't provided explicitly
    if (!id || url.pathname.startsWith('/ecfg_')) {
      id = url.pathname.split('/')[1] || null;
    }

    // clean up URL for use as baseURL
    for (const key of url.searchParams.keys()) {
      url.searchParams.delete(key);
    }

    if (!id || !token) return null;

    // try to parse as external connection string
    return {
      type: 'external',
      baseUrl: url.toString(),
      id,
      token,
      version,
    };
  } catch {
    return null;
  }
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
): EdgeConfigClient {
  if (!connectionString)
    throw new Error('@vercel/edge-config: No connection string provided');

  const connection = getConnection(connectionString);

  if (!connection)
    throw new Error('@vercel/edge-config: Invalid connection string provided');

  const baseUrl = connection.baseUrl;
  const version = connection.version; // version of the edge config read access api we talk to
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.token}`,
  };

  if (typeof process !== 'undefined' && process.env.VERCEL_ENV)
    headers['x-edge-config-vercel-env'] = process.env.VERCEL_ENV;

  if (typeof sdkName === 'string' && typeof sdkVersion === 'string')
    headers['x-edge-config-sdk'] = `${sdkName}@${sdkVersion}`;

  return {
    connection,
    async get<T = EdgeConfigValue>(key: string): Promise<T | undefined> {
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
      ).then<T | undefined, undefined>(
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
            return res.cachedResponseBody as T;
          throw new Error(ERRORS.UNEXPECTED);
        },
        (error) => {
          if (isDynamicServerError(error)) throw error;
          throw new Error(ERRORS.NETWORK);
        },
      );
    },
    async has(key): Promise<boolean> {
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
    },
    async getAll<T = EdgeConfigItems>(keys?: (keyof T)[]): Promise<T> {
      const localEdgeConfig = await getFileSystemEdgeConfig(connection);

      if (localEdgeConfig) {
        if (keys === undefined) {
          return Promise.resolve(clone(localEdgeConfig.items) as T);
        }

        assertIsKeys(keys);
        return Promise.resolve(clone(pick(localEdgeConfig.items, keys)) as T);
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
      ).then<T>(
        async (res) => {
          if (res.ok) return res.json();
          await consumeResponseBodyInNodeJsRuntimeToPreventMemoryLeak(res);

          if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
          // the /items endpoint never returns 404, so if we get a 404
          // it means the edge config itself did not exist
          if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
          if (res.cachedResponseBody !== undefined)
            return res.cachedResponseBody as T;
          throw new Error(ERRORS.UNEXPECTED);
        },
        (error) => {
          if (isDynamicServerError(error)) throw error;
          throw new Error(ERRORS.NETWORK);
        },
      );
    },
    async digest(): Promise<string> {
      const localEdgeConfig = await getFileSystemEdgeConfig(connection);

      if (localEdgeConfig) {
        return Promise.resolve(localEdgeConfig.digest);
      }

      return fetchWithCachedResponse(`${baseUrl}/digest?version=${version}`, {
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
    },
  };
}

let defaultEdgeConfigClient: EdgeConfigClient;

// lazy init fn so the default edge config does not throw in case
// process.env.EDGE_CONFIG is not defined and its methods are never used.
function init(): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
