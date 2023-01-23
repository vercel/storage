type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [x: string]: JsonValue }
  | JsonValue[];

export type EdgeConfigValue = JsonValue;

export interface EmbeddedEdgeConfig {
  digest: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: Record<string, any>;
}
