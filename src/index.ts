import { URLSearchParams } from 'url';
import type { EdgeConfigItemValue, EmbeddedEdgeConfig } from './types';

export type { EdgeConfigItemValue } from './types';

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

/**
 * Throws if a value is undefined or null
 */
function assertIsDefined<T>(value: T): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(
      `Expected value to be defined, but received ${String(value)}`,
    );
  }
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
 * edge-config://<token>\@edge-config.vercel.com/<edgeConfigId>
 *
 * @param text - A potential Edge Config Connection String
 * @returns The edgeConfgId and token parsed from the given text or null if
 * the given text was not a valid Edge Config Connection String.
 */
function matchEdgeConfigConnectionString(
  text: string,
): { edgeConfigId: string; token: string } | null {
  const pattern = `^edge-config:\\/\\/(?<token>[\\w-]+)@edge-config\\.vercel\\.com\\/(?<edgeConfigId>[\\w-]+)$`;
  const match = new RegExp(pattern, 'i').exec(text);
  return match
    ? (match.groups as { edgeConfigId: string; token: string })
    : null;
}

/**
 * Reads an Edge Config from the local file system
 */
function getLocalEdgeConfig(edgeConfigId: string): EmbeddedEdgeConfig | null {
  const embeddedEdgeConfigPath = `/opt/edge-configs/${edgeConfigId}.json`;
  try {
    // https://github.com/webpack/webpack/issues/4175
    /* eslint-disable camelcase */
    const requireFunc =
      typeof __webpack_require__ === 'function'
        ? __non_webpack_require__
        : require;
    /* eslint-enable camelcase */
    return requireFunc
      ? (requireFunc(embeddedEdgeConfigPath) as EmbeddedEdgeConfig)
      : null;
  } catch {
    return null;
  }
}

/**
 * Edge Config Client
 */
export interface EdgeConfigClient {
  get: <T extends EdgeConfigItemValue>(key: string) => Promise<T | undefined>;
  getAll: <T extends Record<string, EdgeConfigItemValue>>(
    keys?: (keyof T)[],
  ) => Promise<T | undefined>;
  has: (key: string) => Promise<boolean>;
  digest: () => Promise<string>;
}

// although the require() / __non_webpack_require__ functions themselves have
// a cache, we want to skip even invoking require() again, so we "cache" the
// edge config in the global module scope
let localEdgeConfig: EmbeddedEdgeConfig | null;

/**
 * Creates a deep clone of an object.
 */
export function createEdgeConfigClient(
  connectionString: string | undefined,
): EdgeConfigClient {
  if (!connectionString)
    throw new Error('@vercel/edge-config: No connection string provided');

  const connection = matchEdgeConfigConnectionString(connectionString);
  if (!connection)
    throw new Error('@vercel/edge-config: Invalid connection string provided');

  const url = `https://edge-config.vercel.com/v1/config/${connection.edgeConfigId}`;
  const headers = { Authorization: `Bearer ${connection.token}` };

  // only try to read from lambda layer if called from a deployed serverless fn
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // load unless it is loaded already
    // the lambda function restarts on config changes, so we can "cache"
    // this in the global module scope
    if (!localEdgeConfig) {
      localEdgeConfig = getLocalEdgeConfig(connection.edgeConfigId);
    }

    // return api which uses the local edge config if one exists
    if (localEdgeConfig) {
      return {
        get<T extends EdgeConfigItemValue>(
          key: string,
        ): Promise<T | undefined> {
          assertIsDefined(localEdgeConfig); // always defined, but make ts happy
          assertIsKey(key);

          // We need to return a clone of the value so users can't modify
          // our original value, and so the reference changes.
          //
          // This makes it consistent with the real API.
          return Promise.resolve(clone(localEdgeConfig.items[key]) as T);
        },
        async getAll<T extends Record<string, EdgeConfigItemValue>>(
          keys?: (keyof T)[],
        ): Promise<T | undefined> {
          assertIsDefined(localEdgeConfig);
          assertIsKeys(keys);

          return Array.isArray(keys)
            ? Promise.resolve(clone(pick(localEdgeConfig.items, keys)) as T)
            : Promise.resolve(clone(localEdgeConfig.items) as T);
        },
        has(key) {
          assertIsDefined(localEdgeConfig); // always defined, but make ts happy
          assertIsKey(key);
          return Promise.resolve(hasOwnProperty(localEdgeConfig.items, key));
        },
        digest() {
          assertIsDefined(localEdgeConfig); // always defined, but make ts happy
          return Promise.resolve(localEdgeConfig.digest);
        },
      };
    }
  }

  return {
    async get<T extends EdgeConfigItemValue>(
      key: string,
    ): Promise<T | undefined> {
      assertIsKey(key);
      return fetch(`${url}/item/${key}`, { headers }).then<
        T | undefined,
        undefined
      >(
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
    async has(key) {
      assertIsKey(key);
      return fetch(`${url}/item/${key}`, { method: 'HEAD', headers }).then(
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
    async getAll<T extends Record<string, EdgeConfigItemValue>>(
      keys?: (keyof T)[],
    ): Promise<T | undefined> {
      if (Array.isArray(keys)) assertIsKeys(keys);

      const search = Array.isArray(keys)
        ? new URLSearchParams(
            keys.map((key) => ['key', key] as [string, string]),
          ).toString()
        : null;

      // empty search keys array was given,
      // so skip the request and return an empty object
      if (search === '') return Promise.resolve({} as T);

      return fetch(`${url}/items${search === null ? '' : `?${search}`}`, {
        headers,
      }).then<T | undefined, undefined>(
        async (res) => {
          if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
          if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
          if (res.ok) return res.json();
          // the /items endpoint will never return 404,
          // so res.ok fails and we throw Unexpected error in case that happens
          throw new Error(ERRORS.UNEXPECTED);
        },
        () => {
          throw new Error(ERRORS.NETWORK);
        },
      );
    },
    async digest() {
      return fetch(`${url}/digest`, { headers }).then(
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
function init() {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!defaultEdgeConfigClient) {
    defaultEdgeConfigClient = createEdgeConfigClient(process.env.EDGE_CONFIG);
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
