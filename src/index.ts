export interface EdgeConfig {
  get: <T extends string | number | null>(
    key: string,
  ) => Promise<T | undefined>;
  has: (key: string) => Promise<boolean>;
  digest: () => Promise<string>;
}

export function createEdgeConfig(baseUrl: string | undefined): EdgeConfig {
  if (!baseUrl) throw new Error('@vercel/edge-data: No URL provided');

  return {
    get<T extends string | number | null>(key: string): Promise<T | undefined> {
      return fetch(`${baseUrl}/item/${key}`).then<T | undefined, undefined>(
        (res) => {
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
      return fetch(`${baseUrl}/item/${key}`, {
        method: 'HEAD',
      }).then(
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
      return fetch(`${baseUrl}/digest`).then(
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

const defaultEdgeConfig = createEdgeConfig(process.env.VERCEL_EDGE_CONFIG);

export const get = defaultEdgeConfig.get.bind(defaultEdgeConfig);
export const has = defaultEdgeConfig.has.bind(defaultEdgeConfig);
export const digest = defaultEdgeConfig.digest.bind(defaultEdgeConfig);
