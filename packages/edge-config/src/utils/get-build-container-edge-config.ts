import type { Connection, EmbeddedEdgeConfig } from '../types';
import { trace } from './tracing';

/**
 * Reads an Edge Config from the local file system using an async import.
 * This is used at runtime on serverless functions.
 */
export const getBuildContainerEdgeConfig = trace(
  async function getBuildContainerEdgeConfig(
    connection: Connection,
  ): Promise<EmbeddedEdgeConfig | null> {
    // can't optimize non-vercel hosted edge configs
    if (connection.type !== 'vercel') return null;

    // the folder won't exist in development, only when deployed
    if (process.env.NODE_ENV === 'development') return null;

    /**
     * Check if running in Vercel build environment
     */
    const isVercelBuild =
      process.env.VERCEL === '1' &&
      process.env.CI === '1' &&
      !process.env.VERCEL_URL; // VERCEL_URL is only available at runtime

    // can only be used during builds
    if (!isVercelBuild) return null;

    try {
      const edgeConfig = (await import(
        /* webpackIgnore: true */ `/tmp/edge-config/${connection.id}.json`
      )) as { default: EmbeddedEdgeConfig };
      return edgeConfig.default;
    } catch {
      return null;
    }
  },
  {
    name: 'getBuildContainerEdgeConfig',
  },
);
