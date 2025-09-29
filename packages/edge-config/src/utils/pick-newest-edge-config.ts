import type { EmbeddedEdgeConfig } from '../types';

export function pickNewestEdgeConfig(
  edgeConfigs: (EmbeddedEdgeConfig | null)[],
): EmbeddedEdgeConfig | null {
  return edgeConfigs.reduce<EmbeddedEdgeConfig | null>((acc, edgeConfig) => {
    if (!edgeConfig) return acc;
    if (!acc) return edgeConfig;
    return edgeConfig.updatedAt > acc.updatedAt ? edgeConfig : acc;
  }, null);
}
