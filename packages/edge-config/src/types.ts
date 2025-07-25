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
