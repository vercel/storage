// The stores.json file is overwritten at build time by the app,
// which then becomes part of the actual app's bundle. This is a fallback
// mechanism used so the app can always fall back to a bundled version of
// the config, even if the Edge Config service is degraded or unavailable.
//
// At build time of the actual app the stores.json file is overwritten
// using the "edge-config prepare" script.
//
// At build time of this package we also copy over a placeholder file,
// such that any app not using the "edge-config prepare" script has
// imports an empty object instead.
//
// By default we provide a "stores.json" file that contains "null", which
// allows us to determine whether the "edge-config prepare" script ran.
// If the value is "null" the script did not run. If the value is an empty
// object or an object with keys the script definitely ran.
//
// @ts-expect-error this file exists in the final bundle
import stores from '@vercel/edge-config/dist/stores.json' with { type: 'json' };
import type { BundledEdgeConfig } from '../types';

/**
 * Reads the local edge config that gets bundled at build time (stores.json).
 */
export function readBundledEdgeConfig(id: string): BundledEdgeConfig | null {
  try {
    // "edge-config prepare" script did not run
    if (stores === null) return null;

    return (stores[id] as BundledEdgeConfig | undefined) ?? null;
  } catch (error) {
    console.error(
      '@vercel/edge-config: Failed to read bundled edge config:',
      error,
    );
    return null;
  }
}
