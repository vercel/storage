#!/usr/bin/env node

/*
 * Reads all connected Edge Configs and emits them to the stores folder
 * that can be accessed at runtime by the mockable-import function.
 *
 * Attaches the updatedAt timestamp from the header to the emitted file, since
 * the endpoint does not currently include it in the response body.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connection, EmbeddedEdgeConfig } from './types';
import { parseConnectionString } from './utils';

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Write to the stores folder relative to the package root
// This works both in development and when installed as a dependency
const getStoresDir = (): string => {
  // In development: packages/edge-config/src/cli.ts -> packages/edge-config/stores/
  // When installed: node_modules/@vercel/edge-config/dist/cli.cjs -> node_modules/@vercel/edge-config/stores/
  return join(__dirname, '..', 'stores');
};

async function main(): Promise<void> {
  const connections = Object.values(process.env).reduce<Connection[]>(
    (acc, value) => {
      if (typeof value !== 'string') return acc;
      const data = parseConnectionString(value);

      if (data) {
        acc.push(data);
      }

      return acc;
    },
    [],
  );

  const storesDir = getStoresDir();
  // eslint-disable-next-line no-console -- This is a CLI tool
  console.log(`Creating stores directory: ${storesDir}`);
  await mkdir(storesDir, { recursive: true });

  await Promise.all(
    connections.map(async (connection) => {
      const { data, updatedAt } = await fetch(connection.baseUrl, {
        headers: {
          authorization: `Bearer ${connection.token}`,
          // consistentRead
          'x-edge-config-min-updated-at': `${Number.MAX_SAFE_INTEGER}`,
        },
      }).then(async (res) => {
        const ts = res.headers.get('x-edge-config-updated-at');

        return {
          data: (await res.json()) as EmbeddedEdgeConfig,
          updatedAt: ts ? Number(ts) : undefined,
        };
      });

      const outputPath = join(storesDir, `${connection.id}.json`);
      await writeFile(outputPath, JSON.stringify({ ...data, updatedAt }));
      // eslint-disable-next-line no-console -- This is a CLI tool
      console.log(`Emitted Edge Config for ${connection.id} to: ${outputPath}`);
    }),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- This is a CLI tool
  console.error('@vercel/edge-config: prepare failed', error);
  process.exit(1);
});
