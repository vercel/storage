export interface EmbeddedEdgeConfig {
  digest: string;
  items: Record<string, EdgeConfigValue>;
}

/**
 * The parsed info contained in a connection string.
 */
export type Connection =
  | {
      baseUrl: string;
      id: string;
      token: string;
      version: string;
      type: 'vercel';
    }
  | {
      baseUrl: string;
      id: string;
      token: string;
      version: string;
      type: 'external';
    };

/**
 * An Edge Config Client.
 *
 * You can create new Edge Config clients using createClient().
 */
export interface EdgeConfigClient {
  /**
   * The parsed info from the connection string which was used to create this client.
   */
  connection: Connection;
  /**
   * Read a single value.
   *
   * @param key - the key to read
   * @returns the value stored under the given key, or undefined
   */
  get: {
    <T = EdgeConfigValue>(
      key: string,
      options: EdgeConfigFunctionsOptions & { metadata: true },
    ): Promise<{ value: T | undefined; digest: string }>;
    <T = EdgeConfigValue>(
      key: string,
      options?: EdgeConfigFunctionsOptions,
    ): Promise<T | undefined>;
  };
  /**
   * Reads multiple values.
   *
   * Allows you to read multiple keys of an Edge Config at once.
   *
   * @param keys - the keys to read
   * @returns Returns entries matching the given keys.
   */
  getMultiple: {
    <T = EdgeConfigItems>(
      keys: (keyof T)[],
      options: EdgeConfigFunctionsOptions & { metadata: true },
    ): Promise<{ value: T; digest: string }>;
    <T = EdgeConfigItems>(
      keys: (keyof T)[],
      options?: EdgeConfigFunctionsOptions,
    ): Promise<T>;
  };

  /**
   * Reads all values.
   *
   * Allows you to read all keys of an Edge Config at once.
   *
   * @returns Returns all entries.
   */
  getAll: {
    <T = EdgeConfigItems>(
      options: EdgeConfigFunctionsOptions & { metadata: true },
    ): Promise<{ value: T; digest: string }>;
    <T = EdgeConfigItems>(options?: EdgeConfigFunctionsOptions): Promise<T>;
  };

  /**
   * Check if a given key exists in the Edge Config.
   *
   * @param key - the key to check
   * @returns true if the given key exists in the Edge Config.
   */
  has: {
    (
      key: string,
      options: EdgeConfigFunctionsOptions & { metadata: true },
    ): Promise<{ exists: boolean; digest: string }>;
    (key: string, options?: EdgeConfigFunctionsOptions): Promise<boolean>;
  };
  /**
   * Get the digest of the Edge Config.
   *
   * The digest is a unique hash result based on the contents stored in the Edge Config.
   *
   * @returns The digest of the Edge Config.
   */
  digest: (options?: EdgeConfigFunctionsOptions) => Promise<string>;
}

export type EdgeConfigItems = Record<string, EdgeConfigValue>;
export type EdgeConfigValue =
  | string
  | number
  | boolean
  | null
  | { [x: string]: EdgeConfigValue }
  | EdgeConfigValue[];

export interface EdgeConfigFunctionsOptions {
  /**
   * Enabling `consistentRead` will bypass all caches and hit the origin
   * directly. This will make sure to fetch the most recent version of
   * an Edge Config with the downside of an increased latency.
   *
   * We do **not** recommend enabling this option, unless you are reading
   * Edge Config specifically for generating a page using ISR and you
   * need to ensure you generate with the latest content.
   */
  consistentRead?: boolean;

  /**
   * Whether to return metadata about the Edge Config, like the digest.
   */
  metadata?: boolean;
}

export interface EdgeConfigClientOptions {
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

export type CacheStatus =
  | 'HIT' // value is cached and deemed fresh
  | 'STALE' // value is cached but we know it's outdated
  | 'MISS' // value was fetched over network as the staleThreshold was exceeded
  | 'BYPASS'; // value was fetched over the network as a consistent read was requested
