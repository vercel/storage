import fs from 'node:fs/promises';
import {
  assertIsKey,
  assertIsKeys,
  clone,
  ERRORS,
  hasOwnProperty,
  parseConnectionString,
  pick,
} from './shared';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';

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
  edgeConfigId: string,
): Promise<EmbeddedEdgeConfig | null> {
  try {
    const content = await fs.readFile(
      `/opt/edge-config/${edgeConfigId}.json`,
      'utf-8',
    );
    return JSON.parse(content) as EmbeddedEdgeConfig;
  } catch {
    return null;
  }
}

/**
 * Handles runtime optimizations
 */
async function getOptimizedEdgeConfig(
  connection: {
    id: string;
    token: string;
  },
  cache: Map<string, EmbeddedEdgeConfig | null | undefined>,
): Promise<EmbeddedEdgeConfig | null> {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const localEdgeConfig = cache.get(connection.id);
    if (localEdgeConfig) return localEdgeConfig;

    const edgeConfig = await getFileSystemEdgeConfig(connection.id);
    if (edgeConfig) cache.set(connection.id, edgeConfig);

    return edgeConfig;
  }

  return null;
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

  /**
   * Holds local edge config in case it exists, serverless only.
   * At runtime we can use the cache instead of reading from fs.
   *
   * Potential values
   * - undefined: we have not checked yet whether it exists or not
   * - null: we checked and it did not exist
   * - EmbeddedEdgeConfig: we checked
   */
  const cache = new Map<string, EmbeddedEdgeConfig | undefined | null>();

  return {
    async get<T extends EdgeConfigValue = EdgeConfigValue>(
      key: string,
    ): Promise<T | undefined> {
      const subEdgeConfig = await getOptimizedEdgeConfig(connection, cache);
      if (subEdgeConfig) {
        assertIsKey(key);

        // We need to return a clone of the value so users can't modify
        // our original value, and so the reference changes.
        //
        // This makes it consistent with the real API.
        return Promise.resolve(clone(subEdgeConfig.items[key]) as T);
      }

      assertIsKey(key);
      return fetch(`${url}/item/${key}?version=${version}`, {
        headers,
      }).then<T | undefined, undefined>(
        async (res) => {
          if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
          if (res.status === 404) {
            // if the x-edge-config-digest header is present, it means
            // the edge config exists, but the item does not
            if (res.headers.has('x-edge-config-digest')) return undefined;
            // if the x-edge-config-digest header is not present, it means
            // the edge config itself does not exist
            throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
          }
          if (res.ok) return res.json();

          throw new Error(ERRORS.UNEXPECTED);
        },
        () => {
          throw new Error(ERRORS.NETWORK);
        },
      );
    },
    async has(key): Promise<boolean> {
      const subEdgeConfig = await getOptimizedEdgeConfig(connection, cache);
      if (subEdgeConfig) {
        assertIsKey(key);
        return Promise.resolve(hasOwnProperty(subEdgeConfig.items, key));
      }

      assertIsKey(key);
      return fetch(`${url}/item/${key}?version=${version}`, {
        method: 'HEAD',
        headers,
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
    async getAll<T extends EdgeConfigItems = EdgeConfigItems>(
      keys?: (keyof T)[],
    ): Promise<T> {
      const subEdgeConfig = await getOptimizedEdgeConfig(connection, cache);

      if (subEdgeConfig) {
        if (keys === undefined) {
          return Promise.resolve(clone(subEdgeConfig.items) as T);
        }

        assertIsKeys(keys);
        return Promise.resolve(clone(pick(subEdgeConfig.items, keys)) as T);
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

      return fetch(
        `${url}/items?version=${version}${search === null ? '' : `&${search}`}`,
        { headers },
      ).then<T>(
        async (res) => {
          if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
          // the /items endpoint never returns 404, so if we get a 404
          // it means the edge config itself did not exist
          if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
          if (res.ok) return res.json();
          throw new Error(ERRORS.UNEXPECTED);
        },
        () => {
          throw new Error(ERRORS.NETWORK);
        },
      );
    },
    async digest(): Promise<string> {
      const subEdgeConfig = await getOptimizedEdgeConfig(connection, cache);

      if (subEdgeConfig) {
        return Promise.resolve(subEdgeConfig.digest);
      }

      return fetch(`${url}/digest?version=1`, { headers }).then(
        (res) => {
          if (!res.ok) throw new Error(ERRORS.UNEXPECTED);
          return res.json() as Promise<string>;
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
