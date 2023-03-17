import {
  assertIsKey,
  assertIsKeys,
  parseConnectionString,
  ERRORS,
} from './shared';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
import { fetchWithCache } from './utils/fetch-with-cache';

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

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
    async get<T extends EdgeConfigValue = EdgeConfigValue>(
      key: string,
    ): Promise<T | undefined> {
      assertIsKey(key);
      return fetchWithCache(`${url}/item/${key}?version=${version}`, {
        headers: new Headers(headers),
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
      assertIsKey(key);
      return fetchWithCache(`${url}/item/${key}?version=${version}`, {
        method: 'HEAD',
        headers: new Headers(headers),
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
      if (Array.isArray(keys)) assertIsKeys(keys);

      const search = Array.isArray(keys)
        ? new URLSearchParams(
            keys.map((key) => ['key', key] as [string, string]),
          ).toString()
        : null;

      // empty search keys array was given,
      // so skip the request and return an empty object
      if (search === '') return Promise.resolve({} as T);

      return fetchWithCache(
        `${url}/items?version=${version}${search === null ? '' : `&${search}`}`,
        { headers: new Headers(headers) },
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
      return fetchWithCache(`${url}/digest?version=1`, {
        headers: new Headers(headers),
      }).then(
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
