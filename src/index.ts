import type { EmbeddedEdgeConfig } from './types';

declare global {
  /* eslint-disable camelcase */
  const __non_webpack_require__: NodeRequire | undefined;
  const __webpack_require__: NodeRequire | undefined;
  /* eslint-enable camelcase */
}

/**
 * Checks if an object has a property
 */
function hasOwnProperty<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const ret: Partial<T> = {};
  keys.forEach((key) => {
    ret[key] = obj[key];
  });
  return ret as Pick<T, K>;
}

function assertIsKey(key: unknown): asserts key is string {
  if (typeof key !== 'string') {
    throw new Error('@vercel/edge-config: Expected key to be a string');
  }
}

function assertIsKeys(keys: unknown): asserts keys is string[] {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
    throw new Error(
      '@vercel/edge-config: Expected keys to be an array of string',
    );
  }
}

const ERRORS = {
  UNEXPECTED: '@vercel/edge-config: Unexpected error',
  UNAUTHORIZED: '@vercel/edge-config: Unauthorized',
  NETWORK: '@vercel/edge-config: Network error',
  EDGE_CONFIG_NOT_FOUND: '@vercel/edge-config: Edge Config not found',
};

/**
 * Creates a deep clone of an object.
 */
function clone<T>(value: T): T {
  // only available since node v17.0.0
  if (typeof structuredClone === 'function') return structuredClone<T>(value);

  // poor man's polyfill for structuredClone
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Parse the edgeConfigId and token from an Edge Config Connection String.
 *
 * Edge Config Connection Strings look like this:
 * https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 *
 * @param text - A potential Edge Config Connection String
 * @returns The id and token parsed from the given Connection String or null if
 * the given text was not a valid Edge Config Connection String.
 */
export function parseConnectionString(
  text: string,
): { id: string; token: string } | null {
  try {
    const url = new URL(text);
    if (url.host !== 'edge-config.vercel.com') return null;
    if (url.protocol !== 'https:') return null;
    if (!url.pathname.startsWith('/ecfg')) return null;

    const id = url.pathname.split('/')[1];
    if (!id) return null;

    const token = url.searchParams.get('token');
    if (!token || token === '') return null;

    return { id, token };
  } catch {
    return null;
  }
}

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
 * Edge Config Client
 */
export interface EdgeConfigClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: <T = any>(key: string) => Promise<T | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll: <T = any>(keys?: (keyof T)[]) => Promise<T | undefined>;
  has: (key: string) => Promise<boolean>;
  digest: () => Promise<string>;
}

/**
 * Creates a deep clone of an object.
 */
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
      if (
        typeof EdgeRuntime !== 'string' &&
        process.env.AWS_LAMBDA_FUNCTION_NAME
      ) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.id);
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
      if (
        typeof EdgeRuntime !== 'string' &&
        process.env.AWS_LAMBDA_FUNCTION_NAME
      ) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.id);
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
      if (
        typeof EdgeRuntime !== 'string' &&
        process.env.AWS_LAMBDA_FUNCTION_NAME
      ) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.id);
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
      if (
        typeof EdgeRuntime !== 'string' &&
        process.env.AWS_LAMBDA_FUNCTION_NAME
      ) {
        if (localEdgeConfig === undefined) {
          localEdgeConfig = await getLocalEdgeConfig(connection.id);
        }
        if (localEdgeConfig) {
          return Promise.resolve(localEdgeConfig.digest);
        }
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
