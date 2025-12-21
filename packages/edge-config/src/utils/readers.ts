// we can't use node:fs/promises here, for known reasons
// import { readFile } from 'node:fs';
// import { promisify } from 'node:util';
import type { EmbeddedEdgeConfig } from '../types';
import { readBuildEmbeddedEdgeConfig } from './mockable-import';

/**
 * Reads the Edge Config that got embedded at build time.
 *
 * Bundlers will often use a lazy strategy where including the module runs
 * a JSON.parse on its content, so we need to be aware of the performance here.
 */
export async function getBuildEmbeddedEdgeConfig(
  edgeConfigId: string,
): Promise<EmbeddedEdgeConfig | null> {
  try {
    const mod = await readBuildEmbeddedEdgeConfig<{
      default: EmbeddedEdgeConfig;
    }>(edgeConfigId);
    return mod ? mod.default : null;
  } catch (e) {
    // console.error('@vercel/edge-config: Error reading local edge config', e);
    return null;
  }
}

/**
 * Reads the Edge Config through the bridge from the layer.
 */
export async function getLayeredEdgeConfig(
  _edgeConfigId: string,
): Promise<EmbeddedEdgeConfig | null> {
  // TODO implement reading the fs
  // const readFileAsync = promisify(readFile);
  // try {
  //   const data = await readFileAsync(
  //     `/opt/edge-config/${edgeConfigId}.json`,
  //     'utf-8',
  //   );
  //   return JSON.parse(data) as EmbeddedEdgeConfig;
  // } catch (e) {
  //   return null;
  // }
  return Promise.resolve(null);
}
