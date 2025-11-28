/**
 * Reads the local edge config that gets embedded at build time.
 *
 * We currently use webpackIgnore to avoid bundling the local edge config.
 */
export async function readBuildEmbeddedEdgeConfig<M>(
  id: string,
): Promise<M | null> {
  try {
    console.log('attempting to read build embedded edge config', id);
    // @ts-expect-error this file is generated later
    return (await import(`@vercel/edge-config/dist/stores.json`).then(
      (module) => module.default[id],
    )) as Promise<M>;
  } catch (e) {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e.code === 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING' ||
        e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
    ) {
      return null;
    }

    throw e;
  }
}
