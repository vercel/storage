import { cacheLife } from 'next/cache';
import { createCreateClient } from './create-create-client';
import {
  fetchAllEdgeConfigItem,
  fetchEdgeConfigHas,
  fetchEdgeConfigItem,
  fetchEdgeConfigTrace,
  getInMemoryEdgeConfig,
  getLocalEdgeConfig,
} from './edge-config';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
import { parseConnectionString } from './utils';

export { setTracerProvider } from './utils/tracing';

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

function setCacheLifeFromFetchCache(
  fetchCache: undefined | 'force-cache' | 'no-store',
): void {
  if (fetchCache === 'force-cache') {
    cacheLife('default');
  } else {
    // Working around a limitation of cacheLife in older Next.js versions
    // where stale was required to be greater than expire if set concurrently.
    // Instead we do this over two calls.
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
  }
}

async function getInMemoryEdgeConfigForNext(
  ...args: Parameters<typeof getInMemoryEdgeConfig>
): ReturnType<typeof getInMemoryEdgeConfig> {
  'use cache';

  const fetchCache = args[1];
  setCacheLifeFromFetchCache(fetchCache);

  return getInMemoryEdgeConfig(...args);
}

async function getLocalEdgeConfigForNext(
  ...args: Parameters<typeof getLocalEdgeConfig>
): ReturnType<typeof getLocalEdgeConfig> {
  'use cache';

  const [type, id, fetchCache] = args;
  setCacheLifeFromFetchCache(fetchCache);

  return getLocalEdgeConfig(type, id, fetchCache);
}

async function fetchEdgeConfigItemForNext<T = EdgeConfigValue>(
  ...args: Parameters<typeof fetchEdgeConfigItem<T>>
): ReturnType<typeof fetchEdgeConfigItem<T>> {
  'use cache';

  const fetchCache = args[5];
  setCacheLifeFromFetchCache(fetchCache);

  return fetchEdgeConfigItem<T>(...args);
}

async function fetchEdgeConfigHasForNext(
  ...args: Parameters<typeof fetchEdgeConfigHas>
): ReturnType<typeof fetchEdgeConfigHas> {
  'use cache';

  const fetchCache = args[5];
  setCacheLifeFromFetchCache(fetchCache);

  return fetchEdgeConfigHas(...args);
}

async function fetchAllEdgeConfigItemForNext<T = EdgeConfigItems>(
  ...args: Parameters<typeof fetchAllEdgeConfigItem<T>>
): ReturnType<typeof fetchAllEdgeConfigItem<T>> {
  'use cache';

  const fetchCache = args[5];
  setCacheLifeFromFetchCache(fetchCache);

  return fetchAllEdgeConfigItem<T>(...args);
}

async function fetchEdgeConfigTraceForNext(
  ...args: Parameters<typeof fetchEdgeConfigTrace>
): ReturnType<typeof fetchEdgeConfigTrace> {
  'use cache';

  const fetchCache = args[4];
  setCacheLifeFromFetchCache(fetchCache);

  return fetchEdgeConfigTrace(...args);
}

/**
 * Create an Edge Config client.
 *
 * The client has multiple methods which allow you to read the Edge Config.
 *
 * If you need to programmatically write to an Edge Config, check out the [Update your Edge Config items](https://vercel.com/docs/storage/edge-config/vercel-api#update-your-edge-config-items) section.
 *
 * @param connectionString - A connection string. Usually you'd pass in `process.env.EDGE_CONFIG` here, which contains a connection string.
 * @returns An Edge Config Client instance
 */
export const createClient = createCreateClient({
  getInMemoryEdgeConfig: getInMemoryEdgeConfigForNext,
  getLocalEdgeConfig: getLocalEdgeConfigForNext,
  fetchEdgeConfigItem: fetchEdgeConfigItemForNext,
  fetchEdgeConfigHas: fetchEdgeConfigHasForNext,
  fetchAllEdgeConfigItem: fetchAllEdgeConfigItemForNext,
  fetchEdgeConfigTrace: fetchEdgeConfigTraceForNext,
});

let defaultEdgeConfigClient: EdgeConfigClient;

// lazy init fn so the default edge config does not throw in case
// process.env.EDGE_CONFIG is not defined and its methods are never used.
function init(): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- [@vercel/style-guide@5 migration]
  if (!defaultEdgeConfigClient) {
    defaultEdgeConfigClient = createClient(process.env.EDGE_CONFIG);
  }
}

/**
 * Reads a single item from the default Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).get()`.
 *
 * @see {@link EdgeConfigClient.get}
 * @param key - the key to read
 * @returns the value stored under the given key, or undefined
 */
export const get: EdgeConfigClient['get'] = (...args) => {
  init();
  return defaultEdgeConfigClient.get(...args);
};

/**
 * Reads multiple or all values.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).getAll()`.
 *
 * @see {@link EdgeConfigClient.getAll}
 * @param keys - the keys to read
 * @returns the value stored under the given key, or undefined
 */
export const getAll: EdgeConfigClient['getAll'] = (...args) => {
  init();
  return defaultEdgeConfigClient.getAll(...args);
};

/**
 * Check if a given key exists in the Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).has()`.
 *
 * @see {@link EdgeConfigClient.has}
 * @param key - the key to check
 * @returns true if the given key exists in the Edge Config.
 */
export const has: EdgeConfigClient['has'] = (...args) => {
  init();
  return defaultEdgeConfigClient.has(...args);
};

/**
 * Get the digest of the Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).digest()`.
 *
 * @see {@link EdgeConfigClient.digest}
 * @returns The digest of the Edge Config.
 */
export const digest: EdgeConfigClient['digest'] = (...args) => {
  init();
  return defaultEdgeConfigClient.digest(...args);
};

/**
 * Safely clones a read-only Edge Config object and makes it mutable.
 */
export function clone<T = EdgeConfigValue>(edgeConfigValue: T): T {
  // Use JSON.parse and JSON.stringify instead of anything else due to
  // the value possibly being a Proxy object.
  return JSON.parse(JSON.stringify(edgeConfigValue)) as T;
}
