export type EdgeConfigItemValue =
  | string
  | number
  | boolean
  | null
  | { [key: string | number]: EdgeConfigItemValue }
  | EdgeConfigItemValue[];

export interface EmbeddedEdgeConfig {
  digest: string;
  items: Record<string, EdgeConfigItemValue>;
}
