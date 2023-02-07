export interface EmbeddedEdgeConfig {
  digest: string;
  items: Record<string, EdgeConfigValue>;
}

/**
 * Edge Config Client
 */
export interface EdgeConfigClient {
  get: <T extends EdgeConfigValue = EdgeConfigValue>(
    key: string,
  ) => Promise<T | undefined>;
  getAll: <T extends EdgeConfigItems = EdgeConfigItems>(
    keys?: (keyof T)[],
  ) => Promise<T>;
  has: (key: string) => Promise<boolean>;
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
