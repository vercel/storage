/**
 * Reads the local edge config that gets bundled at build time (stores.json).
 */
export async function readBundledEdgeConfig<M>(id: string): Promise<M | null> {
  try {
    // @ts-expect-error this file exists in the final bundle
    const mod = await import('@vercel/edge-config/dist/stores.json', {
      with: { type: 'json' },
    });
    return (mod.default[id] as M | undefined) ?? null;
  } catch (error) {
    console.error(
      '@vercel/edge-config: Failed to read bundled edge config:',
      error,
    );
    return null;
  }
}
