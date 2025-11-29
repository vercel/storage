/**
 * Reads the local edge config that gets bundled at build time (stores.json).
 */
export async function readBundledEdgeConfig<M>(id: string): Promise<M | null> {
  try {
    console.log('attempting to read build embedded edge config', id);
    // @ts-expect-error this file is generated later
    const mod = await import('@vercel/edge-config/dist/stores.json', {
      with: { type: 'json' },
    });
    return (mod.default[id] as M | undefined) ?? null;
  } catch (e) {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e.code === 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING' ||
        e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' ||
        e.code === 'MODULE_NOT_FOUND')
    ) {
      return null;
    }

    throw e;
  }
}
