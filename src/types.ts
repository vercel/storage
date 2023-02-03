export interface EmbeddedEdgeConfig {
  digest: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: Record<string, any>;
}

/**
 * Edge Config Client
 */
export interface EdgeConfigClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: <T = any>(key: string) => Promise<T | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll: <T = any>(keys?: (keyof T)[]) => Promise<T | undefined>;
  has: (key: string) => Promise<boolean>;
  digest: () => Promise<string>;
}
