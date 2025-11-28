#!/usr/bin/env node --experimental-strip-types
/// <reference types="node" />

// This script runs uncombiled with "node --experimental-strip-types",
// so all imports need to use ".ts"

/*
 * Reads all connected Edge Configs and emits them to the stores folder
 * that can be accessed at runtime by the mockable-import function.
 *
 * Attaches the updatedAt timestamp from the header to the emitted file, since
 * the endpoint does not currently include it in the response body.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connection, EmbeddedEdgeConfig } from '../src/types.ts';
import { parseConnectionString } from '../src/utils/parse-connection-string.ts';

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Write to the stores folder relative to the package root
// This works both in development and when installed as a dependency
const getStoresDir = (): string => {
  // In development: packages/edge-config/scripts/postinstall.ts -> packages/edge-config/stores/
  // When installed: node_modules/@vercel/edge-config/dist/cli.cjs -> node_modules/@vercel/edge-config/stores/
  return join(__dirname, '..');
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

      // TODO move out of loop
      const outputPath = join(storesDir, `stores.json`);
      await writeFile(
        outputPath,
        JSON.stringify({ [connection.id]: { ...data, updatedAt } }),
      );
      // eslint-disable-next-line no-console -- This is a CLI tool
      console.log(`Emitted Edge Config for ${connection.id} to: ${outputPath}`);
    }),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- This is a CLI tool
  console.error('@vercel/edge-config: postinstall failed', error);
  process.exit(1);
});
