// The data.json file is created at build time by the customer's app
// in node_modules/@vercel/edge-config-storage/. This is a fallback
// mechanism used so the app can always fall back to a bundled version of
// the config, even if the Edge Config service is degraded or unavailable.
//
// At build time of the customer's app, the data.json file is created
// using the "edge-config snapshot" script, which also creates a package.json
// that exports data.json.
//
// If the "edge-config snapshot" script did not run, the import will fail
// and we return null.

// @ts-expect-error this is created at build time of the host app
import stores from '@vercel/edge-config-storage/data.json' with {
  type: 'json',
};
import type { BundledEdgeConfig } from '../types';

/**
 * Reads the local edge config that gets bundled at build time (data.json).
 */
export async function readBundledEdgeConfig(
  id: string,
): Promise<BundledEdgeConfig | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // const stores = await import('@vercel/edge-config-storage/data.json');

    // "edge-config snapshot" script did not run or returned null
    if (stores === null) return null;

    return (stores[id] as BundledEdgeConfig | undefined) ?? null;
  } catch (error) {
    // If the module doesn't exist, the snapshot script didn't run
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      return null;
    }

    console.error(
      '@vercel/edge-config: Failed to read bundled edge config:',
      error,
    );
    return null;
  }
}
