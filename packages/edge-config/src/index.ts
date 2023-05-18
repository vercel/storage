import { readFile } from '@vercel/edge-config-fs';
import {
  assertIsKey,
  assertIsKeys,
  clone,
  ERRORS,
  hasOwnProperty,
  parseConnectionString,
  pick,
} from './utils';
import type {
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
async function getFileSystemEdgeConfig(connection: {
  id: string;
  token: string;
}): Promise<EmbeddedEdgeConfig | null> {
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

export function createClient(
  connectionString: string | undefined,
): EdgeConfigClient {
  if (!connectionString)
    throw new Error('@vercel/edge-config: No connection string provided');

  const connection = parseConnectionString(connectionString);
  if (!connection)
    throw new Error('@vercel/edge-config: Invalid connection string provided');

  const url = `https://edge-config.vercel.com/${connection.id}`;
  const version = '1'; // version of the edge config read access api we talk to
  const headers = { Authorization: `Bearer ${connection.token}` };

  return {
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
      return fetchWithCachedResponse(`${url}/item/${key}?version=${version}`, {
        headers: new Headers(headers),
        cache: 'no-store',
      }).then<T | undefined, undefined>(
        async (res) => {
          if (res.ok) return res.json();
          if (typeof EdgeRuntime === 'undefined') {
            // Read body to avoid memory leaks.
            // see https://github.com/nodejs/undici/blob/v5.21.2/README.md#garbage-collection
            // see https://github.com/node-fetch/node-fetch/issues/83
            await res.arrayBuffer();
          }
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
        () => {
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
      return fetch(`${url}/item/${key}?version=${version}`, {
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
        () => {
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
        `${url}/items?version=${version}${search === null ? '' : `&${search}`}`,
        {
          headers: new Headers(headers),
          cache: 'no-store',
        },
      ).then<T>(
        async (res) => {
          if (res.ok) return res.json();
          if (typeof EdgeRuntime === 'undefined') {
            // Read body to avoid memory leaks.
            // see https://github.com/nodejs/undici/blob/v5.21.2/README.md#garbage-collection
            // see https://github.com/node-fetch/node-fetch/issues/83
            await res.arrayBuffer();
          }
          if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
          // the /items endpoint never returns 404, so if we get a 404
          // it means the edge config itself did not exist
          if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
          if (res.cachedResponseBody !== undefined)
            return res.cachedResponseBody as T;
          throw new Error(ERRORS.UNEXPECTED);
        },
        () => {
          throw new Error(ERRORS.NETWORK);
        },
      );
    },
    async digest(): Promise<string> {
      const localEdgeConfig = await getFileSystemEdgeConfig(connection);

      if (localEdgeConfig) {
        return Promise.resolve(localEdgeConfig.digest);
      }

      return fetchWithCachedResponse(`${url}/digest?version=1`, {
        headers: new Headers(headers),
        cache: 'no-store',
      }).then(
        async (res) => {
          if (res.ok) return res.json() as Promise<string>;
          if (typeof EdgeRuntime === 'undefined') {
            // Read body to avoid memory leaks.
            // see https://github.com/nodejs/undici/blob/v5.21.2/README.md#garbage-collection
            // see https://github.com/node-fetch/node-fetch/issues/83
            await res.arrayBuffer();
          }
          if (res.cachedResponseBody !== undefined)
            return res.cachedResponseBody as string;
          throw new Error(ERRORS.UNEXPECTED);
        },
        () => {
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

export const get: EdgeConfigClient['get'] = (...args) => {
  init();
  return defaultEdgeConfigClient.get(...args);
};

export const getAll: EdgeConfigClient['getAll'] = (...args) => {
  init();
  return defaultEdgeConfigClient.getAll(...args);
};

export const has: EdgeConfigClient['has'] = (...args) => {
  init();
  return defaultEdgeConfigClient.has(...args);
};

export const digest: EdgeConfigClient['digest'] = (...args) => {
  init();
  return defaultEdgeConfigClient.digest(...args);
};
