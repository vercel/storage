import {
  assertIsKey,
  assertIsKeys,
  ERRORS,
  hasOwnProperty,
  matchEdgeConfigConnectionString,
  pick,
  clone,
} from './shared';
import type { EdgeConfigClient, EmbeddedEdgeConfig } from './types';

/**
 * Reads an Edge Config from the local file system
 */
async function getLocalEdgeConfig(
  edgeConfigId: string,
): Promise<EmbeddedEdgeConfig | null> {
  // skip in Edge Runtime, as it has no fs
  if (typeof EdgeRuntime === 'string') return null;

  // import "fs/promises"
  const fs = (await import(
    // Joining here avoids this warning:
    //   A Node.js module is loaded ('fs/promises' at line 1) which is not
    //   upported in the Edge Runtime
    //
    // This is fine as this code never runs inside of EdgeRuntime due to the
    // check above
    ['fs', 'promises'].join('/')
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  )) as typeof import('fs/promises');

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
 * Creates a deep clone of an object.
 */
export function createClient(
  connectionString: string | undefined,
): EdgeConfigClient {
  if (!connectionString)
    throw new Error('@vercel/edge-config: No connection string provided');

  const connection = matchEdgeConfigConnectionString(connectionString);
  if (!connection)
    throw new Error('@vercel/edge-config: Invalid connection string provided');

  const url = `https://edge-config.vercel.com/${connection.edgeConfigId}`;
  const version = '1'; // version of the edge config read access api we talk to
  const headers = { Authorization: `Bearer ${connection.token}` };

  /**
   * Holds local edge config in case it exists
   *
   * Potential values
   * - undefined: we have not checked yet whether it exists or not
   * - null: we checked and it did not exist
   * - EmbeddedEdgeConfig: we checked
   */
  let localEdgeConfig: EmbeddedEdgeConfig | null | undefined;

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async get<T = any>(key: string): Promise<T | undefined> {
      if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.edgeConfigId);
        }

        if (localEdgeConfig) {
          assertIsKey(key);

          // We need to return a clone of the value so users can't modify
          // our original value, and so the reference changes.
          //
          // This makes it consistent with the real API.
          return Promise.resolve(clone(localEdgeConfig.items[key]) as T);
        }
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
      if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.edgeConfigId);
        }

        if (localEdgeConfig) {
          assertIsKey(key);
          return Promise.resolve(hasOwnProperty(localEdgeConfig.items, key));
        }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getAll<T = any>(keys?: (keyof T)[]): Promise<T | undefined> {
      if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.edgeConfigId);
        }

        if (localEdgeConfig) {
          assertIsKeys(keys);

          return Array.isArray(keys)
            ? Promise.resolve(clone(pick(localEdgeConfig.items, keys)) as T)
            : Promise.resolve(clone(localEdgeConfig.items) as T);
        }
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
      ).then<T | undefined, undefined>(
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
      if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.edgeConfigId);
        }
        if (localEdgeConfig) {
          return Promise.resolve(localEdgeConfig.digest);
        }
      }

      return fetch(`${url}/digest?version=1`, { headers }).then(
        (res) => {
          if (!res.ok) throw new Error(ERRORS.UNEXPECTED);
          return res.json().then((data: { digest: string }) => data.digest);
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
