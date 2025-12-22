export interface EmbeddedEdgeConfig {
  digest: string;
  items: Record<string, EdgeConfigValue>;
}

/**
 * An Edge Config bundled into data.json
 *
 * The contents of data.json itself are either
 * - null
 * - Record<string, BundledEdgeConfig>
 */
export type BundledEdgeConfig = {
  data: EmbeddedEdgeConfig;
  updatedAt: number | undefined;
};

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
      snapshot: 'required' | 'optional';
      timeoutMs: number | undefined;
    }
  | {
      baseUrl: string;
      id: string;
      token: string;
      version: string;
      type: 'external';
      snapshot: 'required' | 'optional';
      timeoutMs: number | undefined;
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
  get: <T = EdgeConfigValue>(
    key: string,
    options?: EdgeConfigFunctionsOptions,
  ) => Promise<T | undefined>;
  /**
   * Reads multiple or all values.
   *
   * Allows you to read all or only selected keys of an Edge Config at once.
   *
   * @param keys - the keys to read
   * @returns Returns all entries when called with no arguments or only entries matching the given keys otherwise.
   */
  getAll: <T = EdgeConfigItems>(
    keys?: (keyof T)[],
    options?: EdgeConfigFunctionsOptions,
  ) => Promise<T>;
  /**
   * Check if a given key exists in the Edge Config.
   *
   * @param key - the key to check
   * @returns true if the given key exists in the Edge Config.
   */
  has: (key: string, options?: EdgeConfigFunctionsOptions) => Promise<boolean>;
  /**
   * Get the digest of the Edge Config.
   *
   * The digest is a unique hash result based on the contents stored in the Edge Config.
   *
   * @returns The digest of the Edge Config.
   */
  digest: (options?: EdgeConfigFunctionsOptions) => Promise<string>;

  /**
   * Reads the bootstrap data snapshot of the Edge Config that got embedded at build time.
   *
   * @returns The bootstrap data of the Edge Config
   */
  getBootstrapData: () => Promise<
    | { store: BundledEdgeConfig; state: 'ok' }
    | { store: null; state: 'external-connection' }
    | { store: null; state: 'missing-file' | 'missing-entry' }
    | { store: null; state: 'unexpected-error'; error: unknown }
  >;
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
   * How long to wait for the Edge Config to be fetched before timing out
   * and falling back to the bundled Edge Config value if present, or throwing.
   */
  timeoutMs?: number;
}
