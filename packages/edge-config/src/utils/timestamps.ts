import type { Connection } from '../types';

const privateEdgeConfigSymbol = Symbol.for('privateEdgeConfig');

/**
 * Reads the updatedAt timestamp of the most recent Edge Config update,
 * so we can compare that to what we have in cache.
 */
export function getMostRecentUpdateTimestamp(
  connection: Connection,
): number | null {
  const privateEdgeConfig = Reflect.get(globalThis, privateEdgeConfigSymbol) as
    | { getUpdatedAt: (id: string) => number | null }
    | undefined;

  return typeof privateEdgeConfig === 'object' &&
    typeof privateEdgeConfig.getUpdatedAt === 'function'
    ? privateEdgeConfig.getUpdatedAt(connection.id)
    : null;
}

export function parseTs(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const parsed = Number.parseInt(updatedAt, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}
