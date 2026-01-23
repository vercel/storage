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
import { ERRORS, parseConnectionString } from './utils';

export { TimeoutError } from './utils/timeout-error';
export { setTracerProvider } from './utils/tracing';

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

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
  getInMemoryEdgeConfig,
  getLocalEdgeConfig,
  fetchEdgeConfigItem,
  fetchEdgeConfigHas,
  fetchAllEdgeConfigItem,
  fetchEdgeConfigTrace,
});

/**
 * The default Edge Config client that is automatically created from the `process.env.EDGE_CONFIG` environment variable.
 * When using the `get`, `getAl`, `has`, and `digest` exports they use this underlying default client.
 */
export const defaultClient: EdgeConfigClient | null =
  typeof process.env.EDGE_CONFIG === 'string' &&
  (process.env.EDGE_CONFIG.startsWith('edge-config:') ||
    process.env.EDGE_CONFIG.startsWith('https://edge-config.vercel.com/'))
    ? createClient(process.env.EDGE_CONFIG)
    : null;

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
  if (!defaultClient) {
    throw new Error(ERRORS.MISSING_DEFAULT_EDGE_CONFIG_CONNECTION_STRING);
  }
  return defaultClient.get(...args);
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
  if (!defaultClient) {
    throw new Error(ERRORS.MISSING_DEFAULT_EDGE_CONFIG_CONNECTION_STRING);
  }
  return defaultClient.getAll(...args);
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
  if (!defaultClient) {
    throw new Error(ERRORS.MISSING_DEFAULT_EDGE_CONFIG_CONNECTION_STRING);
  }
  return defaultClient.has(...args);
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
  if (!defaultClient) {
    throw new Error(ERRORS.MISSING_DEFAULT_EDGE_CONFIG_CONNECTION_STRING);
  }
  return defaultClient.digest(...args);
};

/**
 * Safely clones a read-only Edge Config object and makes it mutable.
 */
export function clone<T = EdgeConfigValue>(edgeConfigValue: T): T {
  // Use JSON.parse and JSON.stringify instead of anything else due to
  // the value possibly being a Proxy object.
  return JSON.parse(JSON.stringify(edgeConfigValue)) as T;
}
