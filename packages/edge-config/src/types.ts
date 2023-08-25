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
  get: <T = EdgeConfigValue>(key: string) => Promise<T | undefined>;
  /**
   * Reads multiple or all values.
   *
   * Allows you to read all or only selected keys of an Edge Config at once.
   *
   * @param keys - the keys to read
   * @returns Returns all entries when called with no arguments or only entries matching the given keys otherwise.
   */
  getAll: <T = EdgeConfigItems>(keys?: (keyof T)[]) => Promise<T>;
  /**
   * Check if a given key exists in the Edge Config.
   *
   * @param key - the key to check
   * @returns true if the given key exists in the Edge Config.
   */
  has: (key: string) => Promise<boolean>;
  /**
   * Get the digest of the Edge Config.
   *
   * The digest is a unique hash result based on the contents stored in the Edge Config.
   *
   * @returns The digest of the Edge Config.
   */
  digest: () => Promise<string>;
}

export type EdgeConfigItems = Record<string, EdgeConfigValue>;
export type EdgeConfigValue =
  | string
  | number
  | boolean
  | null
  | { [x: string]: EdgeConfigValue }
  | EdgeConfigValue[];
