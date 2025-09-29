/**
 * Reads the local edge config that gets embedded at build time.
 *
 * We currently use webpackIgnore to avoid bundling the local edge config.
 */
export async function readBuildEmbeddedEdgeConfig<M>(
  id: string,
): Promise<M | null> {
  try {
    return (await import(
      /* webpackIgnore: true */ `@vercel/edge-config/stores/${id}.json`
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
