import type { EdgeConfigItemValue, EmbeddedEdgeConfig } from './types';

export type { EdgeConfigItemValue } from './types';

declare global {
  /* eslint-disable camelcase */
  const __non_webpack_require__: NodeRequire | undefined;
  const __webpack_require__: NodeRequire | undefined;
  /* eslint-enable camelcase */
}

function hasOwnProperty<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function assertIsDefined<T>(val: T): asserts val is NonNullable<T> {
  if (val === undefined || val === null) {
    throw new Error(
      `Expected 'val' to be defined, but received ${String(val)}`,
    );
  }
}

// clones the value so the JSON does not get modified
 
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

function getLocalEdgeConfig(edgeConfigId: string): EmbeddedEdgeConfig | null {
  const embeddedEdgeConfigPath = `/opt/edge-configs/${edgeConfigId}.json`;
  try {
    // https://github.com/webpack/webpack/issues/4175
    /* eslint-disable camelcase */
    const requireFunc =
      typeof __webpack_require__ === 'function' &&
      typeof __non_webpack_require__ === 'function'
        ? __non_webpack_require__
        : require;
    /* eslint-enable camelcase */
    return requireFunc(embeddedEdgeConfigPath) as EmbeddedEdgeConfig;
  } catch {
    return null;
  }
}
/**
 * Edge Config
 */
export interface EdgeConfigClient {
  get: <T extends EdgeConfigItemValue>(key: string) => Promise<T | undefined>;
  has: (key: string) => Promise<boolean>;
  digest: () => Promise<string>;
}

// although the require() / __non_webpack_require__ functions themselves have
// a cache, we want to skip even invoking require() again, so we "cache" the
// edge config in the global module scope
let localEdgeConfig: EmbeddedEdgeConfig | null;

export function createEdgeConfigClient(
  connectionString: string | undefined,
): EdgeConfigClient {
  if (!connectionString)
    throw new Error('@vercel/edge-data: No connection string provided');

  const connection = matchEdgeConfigConnectionString(connectionString);
  if (!connection)
    throw new Error('@vercel/edge-data: Invalid connection string provided');

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
          return Promise.resolve(clone(localEdgeConfig.items[key]) as T);
        },
        has(key) {
          assertIsDefined(localEdgeConfig); // always defined, but make ts happy
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
      return fetch(`${url}/item/${key}`, { headers }).then<
        T | undefined,
        undefined
      >(
        async (res) => {
          if (res.status === 404) return undefined;
          if (res.ok) return res.json();
          throw new Error('@vercel/edge-data: Unexpected error');
        },
        () => {
          throw new Error('@vercel/edge-data: Network error');
        },
      );
    },
    async has(key) {
      return fetch(`${url}/item/${key}`, { method: 'HEAD', headers }).then(
        (res) => {
          if (res.status === 404) return false;
          if (res.ok) return true;
          throw new Error('@vercel/edge-data: Unexpected error');
        },
        () => {
          throw new Error('@vercel/edge-data: Network error');
        },
      );
    },
    async digest() {
      return fetch(`${url}/digest`, { headers }).then(
        (res) => {
          if (!res.ok) throw new Error('@vercel/edge-data: Unexpected error');
          return res.json().then((data: { digest: string }) => data.digest);
        },
        () => {
          throw new Error('@vercel/edge-data: Network error');
        },
      );
    },
  };
}

let defaultEdgeConfigClient: EdgeConfigClient;

// lazy init fn so the default edge config does not throw in case
// process.env.VERCEL_EDGE_CONFIG is not defined and its methods are never used.
function init() {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!defaultEdgeConfigClient) {
    defaultEdgeConfigClient = createEdgeConfigClient(
      process.env.VERCEL_EDGE_CONFIG,
    );
  }
}

export const get: EdgeConfigClient['get'] = (...args) => {
  init();
  return defaultEdgeConfigClient.get(...args);
};

export const has: EdgeConfigClient['has'] = (...args) => {
  init();
  return defaultEdgeConfigClient.has(...args);
};

export const digest: EdgeConfigClient['digest'] = (...args) => {
  init();
  return defaultEdgeConfigClient.digest(...args);
};
