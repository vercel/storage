export type EdgeConfigItemValue =
  | string
  | number
  | boolean
  | null
  | { [key: string | number]: EdgeConfigItemValue }
  | EdgeConfigItemValue[];

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
 * Edge Config
 */
export interface EdgeConfig {
  get: <T extends EdgeConfigItemValue>(key: string) => Promise<T | undefined>;
  has: (key: string) => Promise<boolean>;
  digest: () => Promise<{ digest: string }>;
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

  return {
    get<T extends EdgeConfigItemValue>(key: string): Promise<T | undefined> {
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
    has(key) {
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
    digest() {
      return fetch(`${url}/digest`, { headers }).then(
        (res) => {
          if (!res.ok) throw new Error('@vercel/edge-data: Unexpected error');
          return res.json();
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
