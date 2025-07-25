// use build time cache if present
//
// at runtime, bootstrap initial state over network
//
// fresh → reuse
// stale (recent) → reuse, refresh in bg
// stale (old) → blocking fetch
//
// treat it all as per-key caches

import { name as sdkName, version as sdkVersion } from '../package.json';
import {
  assertIsKey,
  isEmptyKey,
  ERRORS,
  UnexpectedNetworkError,
  parseConnectionString,
} from './utils';
import type {
  EdgeConfigClient,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
  EdgeConfigFunctionsOptions,
  Connection,
} from './types';
import { enhancedFetch } from './utils/enhanced-fetch';
import { trace } from './utils/tracing';
import { consumeResponseBody } from './utils/consume-response-body';
import { addConsistentReadHeader } from './utils/add-consistent-read-header';

export { setTracerProvider } from './utils/tracing';

export {
  parseConnectionString,
  type EdgeConfigClient,
  type EdgeConfigItems,
  type EdgeConfigValue,
  type EmbeddedEdgeConfig,
};

interface EdgeConfigClientOptions {
  /**
   * Configure for how long the SDK will return a stale value in case a fresh value could not be fetched.
   *
   * @default Infinity
   */
  staleIfError?: number | false;

  /**
   * Configure the threshold for how long the SDK allows stale values to be
   * served after they become outdated. The SDK will switch from refreshing
   * in the background to performing a blocking fetch when this threshold is
   * exceeded.
   *
   * The threshold configures the difference, in seconds, between when an update
   * was made until the SDK will force fetch the latest value.
   *
   * Background refresh example:
   * If you set this value to 10 seconds, then reads within 10
   * seconds after an update was made will be served from the in-memory cache,
   * while a background refresh will be performed. Once the background refresh
   * completes any further reads will be served from the updated in-memory cache,
   * and thus also return the latest value.
   *
   * Blocking read example:
   * If an Edge Config is updated and there are no reads in the 10 seconds after
   * the update was made then there will be no background refresh. When the next
   * read happens more than 10 seconds later it will be a blocking read which
   * reads from the origin. This takes slightly longer but guarantees that the
   * SDK will never serve a value that is stale for more than 10 seconds.
   *
   *
   * @default 10
   */
  staleThreshold?: number;

  /**
   * In development, a stale-while-revalidate cache is employed as the default caching strategy.
   *
   * This cache aims to deliver speedy Edge Config reads during development, though it comes
   * at the cost of delayed visibility for updates to Edge Config. Typically, you may need to
   * refresh twice to observe these changes as the stale value is replaced.
   *
   * This cache is not used in preview or production deployments as superior optimisations are applied there.
   */
  disableDevelopmentCache?: boolean;

  /**
   * Sets a `cache` option on the `fetch` call made by Edge Config.
   *
   * Unlike Next.js, this defaults to `no-store`, as you most likely want to use Edge Config dynamically.
   */
  cache?: 'no-store' | 'force-cache';
}

class Controller {
  private edgeConfig: EmbeddedEdgeConfig | null = null;
  private connection: Connection;
  private status: 'pristine' | 'refreshing' | 'stale' = 'pristine';
  private options: EdgeConfigClientOptions;
  private shouldUseDevelopmentCache: boolean;

  private pendingEdgeConfigPromise: Promise<EmbeddedEdgeConfig | null> | null =
    null;

  constructor(
    connection: Connection,
    options: EdgeConfigClientOptions,
    shouldUseDevelopmentCache: boolean,
  ) {
    this.connection = connection;
    this.options = options;
    this.shouldUseDevelopmentCache = shouldUseDevelopmentCache;
  }

  public async get<T>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T | undefined; digest: string }> {
    return enhancedFetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions),
        cache: this.getFetchCache(),
      },
    ).then<{ value: T | undefined; digest: string }>(async (res) => {
      const digest = res.headers.get('x-edge-config-digest');

      if (!digest) {
        throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      }

      if (res.ok) {
        const value = (await res.json()) as T;
        return { value, digest };
      }

      await consumeResponseBody(res);

      if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
      if (res.status === 404) {
        // if the x-edge-config-digest header is present, it means
        // the edge config exists, but the item does not
        if (res.headers.has('x-edge-config-digest'))
          return { value: undefined, digest };
        // if the x-edge-config-digest header is not present, it means
        // the edge config itself does not exist
        throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      }
      throw new UnexpectedNetworkError(res);
    });
  }

  public async has(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ exists: boolean; digest: string }> {
    return fetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        method: 'HEAD',
        headers: this.getHeaders(localOptions),
        cache: this.getFetchCache(),
      },
    ).then<{ exists: boolean; digest: string }>((res) => {
      if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
      const digest = res.headers.get('x-edge-config-digest');

      if (!digest) {
        // if the x-edge-config-digest header is not present, it means
        // the edge config itself does not exist
        throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      }

      if (res.ok) return { digest, exists: res.status !== 404 };
      throw new UnexpectedNetworkError(res);
    });
  }

  public async digest(
    localOptions?: Pick<EdgeConfigFunctionsOptions, 'consistentRead'>,
  ): Promise<string> {
    return enhancedFetch(
      `${this.connection.baseUrl}/digest?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions),
        cache: this.getFetchCache(),
      },
    ).then<string>(async (res) => {
      if (res.ok) return res.json() as Promise<string>;
      await consumeResponseBody(res);

      // if (res.cachedResponseBody !== undefined)
      //   return res.cachedResponseBody as string;
      throw new UnexpectedNetworkError(res);
    });
  }

  public async getMultiple<T>(
    keys: (keyof T)[],
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T; digest: string }> {
    if (!Array.isArray(keys)) {
      throw new Error('@vercel/edge-config: keys must be an array');
    }

    // Return early if there are no keys to be read.
    // This is only possible if the digest is not required, or if we have a
    // cached digest (not implemented yet).
    if (!localOptions?.metadata && keys.length === 0) {
      return { value: {} as T, digest: '' };
    }

    const search = new URLSearchParams(
      keys
        .filter((key) => typeof key === 'string' && !isEmptyKey(key))
        .map((key) => ['key', key] as [string, string]),
    ).toString();

    return enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}&${search}`,
      {
        headers: this.getHeaders(localOptions),
        cache: this.getFetchCache(),
      },
    ).then<{ value: T; digest: string }>(async (res) => {
      if (res.ok) {
        const digest = res.headers.get('x-edge-config-digest');
        if (!digest) {
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        }
        const value = (await res.json()) as T;
        return { value, digest };
      }
      await consumeResponseBody(res);

      if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
      // the /items endpoint never returns 404, so if we get a 404
      // it means the edge config itself did not exist
      if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      // if (res.cachedResponseBody !== undefined)
      //   return res.cachedResponseBody as T;
      throw new UnexpectedNetworkError(res);
    });
  }

  public async getAll<T>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{ value: T; digest: string }> {
    return enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions),
        cache: this.getFetchCache(),
      },
    ).then<{ value: T; digest: string }>(async (res) => {
      if (res.ok) {
        const digest = res.headers.get('x-edge-config-digest');
        if (!digest) {
          throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
        }
        const value = (await res.json()) as T;
        return { value, digest };
      }
      await consumeResponseBody(res);

      if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
      // the /items endpoint never returns 404, so if we get a 404
      // it means the edge config itself did not exist
      if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      // if (res.cachedResponseBody !== undefined)
      //   return res.cachedResponseBody as T;
      throw new UnexpectedNetworkError(res);
    });
  }

  private getFetchCache(): 'no-store' | 'force-cache' {
    return this.options.cache || 'no-store';
  }

  private getHeaders(
    localOptions: EdgeConfigFunctionsOptions | undefined,
  ): Headers {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.connection.token}`,
    };
    const localHeaders = new Headers(headers);
    if (localOptions?.consistentRead) addConsistentReadHeader(localHeaders);

    return localHeaders;
  }
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
export const createClient = trace(
  function createClient(
    connectionString: string | undefined,
    options: EdgeConfigClientOptions = {
      staleIfError: 604800 /* one week */,
      staleThreshold: 60 /* 1 minute */,
      cache: 'no-store',
    },
  ): EdgeConfigClient {
    if (!connectionString)
      throw new Error('@vercel/edge-config: No connection string provided');

    const connection = parseConnectionString(connectionString);

    if (!connection)
      throw new Error(
        '@vercel/edge-config: Invalid connection string provided',
      );

    const baseUrl = connection.baseUrl;
    const version = connection.version; // version of the edge config read access api we talk to
    const headers: Record<string, string> = {
      Authorization: `Bearer ${connection.token}`,
    };

    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- [@vercel/style-guide@5 migration]
    if (typeof process !== 'undefined' && process.env.VERCEL_ENV)
      headers['x-edge-config-vercel-env'] = process.env.VERCEL_ENV;

    if (typeof sdkName === 'string' && typeof sdkVersion === 'string')
      headers['x-edge-config-sdk'] = `${sdkName}@${sdkVersion}`;

    if (typeof options.staleIfError === 'number' && options.staleIfError > 0)
      headers['cache-control'] = `stale-if-error=${options.staleIfError}`;

    const fetchCache = options.cache || 'no-store';

    /**
     * While in development we use SWR-like behavior for the api client to
     * reduce latency.
     */
    const shouldUseDevelopmentCache =
      !options.disableDevelopmentCache &&
      process.env.NODE_ENV === 'development' &&
      process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR !== '1';

    const controller = new Controller(
      connection,
      options,
      shouldUseDevelopmentCache,
    );

    const edgeConfigId = connection.id;

    const methods: Pick<
      EdgeConfigClient,
      'get' | 'has' | 'getMultiple' | 'getAll' | 'digest'
    > = {
      get: trace(
        async function get<T = EdgeConfigValue>(
          key: string,
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<T | undefined | { value: T | undefined; digest: string }> {
          assertIsKey(key);
          if (isEmptyKey(key)) {
            throw new Error('@vercel/edge-config: Can not read empty key');
          }
          const data = await controller.get<T>(key, localOptions);
          return localOptions?.metadata ? data : data.value;
        },
        { name: 'get', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      has: trace(
        async function has(
          key: string,
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<boolean | { exists: boolean; digest: string }> {
          assertIsKey(key);
          if (isEmptyKey(key)) {
            throw new Error('@vercel/edge-config: Can not read empty key');
          }

          const data = await controller.has(key, localOptions);
          return localOptions?.metadata ? data : data.exists;
        },
        { name: 'has', isVerboseTrace: false, attributes: { edgeConfigId } },
      ) as EdgeConfigClient['has'],
      getMultiple: trace(
        async function getMultiple<T>(
          keys: (keyof T)[],
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<{ value: T; digest: string } | T> {
          const data = await controller.getMultiple<T>(keys, localOptions);
          return localOptions?.metadata ? data : data.value;
        },
        {
          name: 'getMultiple',
          isVerboseTrace: false,
          attributes: { edgeConfigId },
        },
      ),
      getAll: trace(
        async function getAll<T = EdgeConfigItems>(
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<{ value: T; digest: string } | T> {
          const data = await controller.getAll<T>(localOptions);
          return localOptions?.metadata ? data : data.value;
        },
        { name: 'getAll', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
      digest: trace(
        async function digest(
          localOptions?: EdgeConfigFunctionsOptions,
        ): Promise<string> {
          const localHeaders = new Headers(headers);
          if (localOptions?.consistentRead)
            addConsistentReadHeader(localHeaders);

          return enhancedFetch(`${baseUrl}/digest?version=${version}`, {
            headers: localHeaders,
            cache: fetchCache,
          }).then(async (res) => {
            if (res.ok) return res.json() as Promise<string>;
            await consumeResponseBody(res);

            // if (res.cachedResponseBody !== undefined)
            //   return res.cachedResponseBody as string;
            throw new UnexpectedNetworkError(res);
          });
        },
        { name: 'digest', isVerboseTrace: false, attributes: { edgeConfigId } },
      ),
    };

    return { ...methods, connection };
  },
  {
    name: 'createClient',
  },
);

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
 * Check if a given key exists in the Edge Config.
 *
 * This is a convenience method which reads the default Edge Config.
 * It is conceptually similar to `createClient(process.env.EDGE_CONFIG).has()`.
 *
 * @see {@link EdgeConfigClient.has}
 * @param key - the key to check
 * @returns true if the given key exists in the Edge Config.
 */
export const has = ((...args: Parameters<EdgeConfigClient['has']>) => {
  init();
  return defaultEdgeConfigClient.has(...args);
}) as EdgeConfigClient['has'];

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
