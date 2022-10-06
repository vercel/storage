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
  // only try to read from lambda layer if called from a deployed serverless fn
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return null;

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
export interface EdgeConfig {
  get: <T extends EdgeConfigItemValue>(key: string) => Promise<T | undefined>;
  has: (key: string) => Promise<boolean>;
  digest: () => Promise<string>;
}

export function createEdgeConfigClient(
  connectionString: string | undefined,
): EdgeConfig {
  if (!connectionString)
    throw new Error('@vercel/edge-data: No connection string provided');

  const connection = matchEdgeConfigConnectionString(connectionString);
  if (!connection)
    throw new Error('@vercel/edge-data: Invalid connection string provided');

  const url = `https://edge-config.vercel.com/v1/config/${connection.edgeConfigId}`;
  const headers = { Authorization: `Bearer ${connection.token}` };

  const localEdgeConfig = getLocalEdgeConfig(connection.edgeConfigId);
  if (localEdgeConfig) {
    return {
      get<T extends EdgeConfigItemValue>(key: string): Promise<T | undefined> {
        return Promise.resolve(localEdgeConfig.items[key] as T);
      },
      has(key) {
        return Promise.resolve(hasOwnProperty(localEdgeConfig.items, key));
      },
      digest() {
        return Promise.resolve(localEdgeConfig.digest);
      },
    };
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

const defaultEdgeConfig = createEdgeConfigClient(
  process.env.VERCEL_EDGE_CONFIG,
);

export const get: typeof defaultEdgeConfig.get =
  defaultEdgeConfig.get.bind(defaultEdgeConfig);

export const has: typeof defaultEdgeConfig.has =
  defaultEdgeConfig.has.bind(defaultEdgeConfig);

export const digest: typeof defaultEdgeConfig.digest =
  defaultEdgeConfig.digest.bind(defaultEdgeConfig);
