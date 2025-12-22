// The stores.json file is created at build time by the customer's app
// in node_modules/@vercel/edge-config-storage/. This is a fallback
// mechanism used so the app can always fall back to a bundled version of
// the config, even if the Edge Config service is degraded or unavailable.
//
// At build time of the customer's app, the stores.json file is created
// using the "edge-config snapshot" script, which also creates a package.json
// that exports stores.json.
//
// If the "edge-config snapshot" script did not run, the import will fail
// and we return null.
import type { BundledEdgeConfig } from '../types';

/**
 * Reads the local edge config that gets bundled at build time (stores.json).
 */
export async function readBundledEdgeConfig(
  id: string,
): Promise<
  | { store: BundledEdgeConfig; state: 'ok' }
  | { store: null; state: 'missing-file' | 'missing-entry' }
  | { store: null; state: 'unexpected-error'; error: unknown }
> {
  let stores: Record<string, BundledEdgeConfig>;
  try {
    // @ts-expect-error this only exists at build time
    stores = await import('@vercel/edge-config-storage/stores.json');
  } catch (error) {
    // If the module doesn't exist, the snapshot script didn't run
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      return { store: null, state: 'missing-file' };
    }

    return { store: null, state: 'unexpected-error', error: error };
  }

  const store = stores && Object.hasOwn(stores, id) ? stores[id] : null;
  if (!store) return { store: null, state: 'missing-entry' };
  return { store: store, state: 'ok' };
}
