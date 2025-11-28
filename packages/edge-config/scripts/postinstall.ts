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
import type { Connection, EmbeddedEdgeConfig } from '../src/types';
import { parseConnectionString } from '../src/utils/parse-connection-string';

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type StoresJson = Record<
  string,
  {
    data: EmbeddedEdgeConfig;
    updatedAt: number | undefined;
  }
>;

// Write to the stores.json file of the package itself
const getOutputPath = (): string => {
  // During development: packages/edge-config/stores.json
  // When installed: node_modules/@vercel/edge-config/stores.json
  return join(__dirname, '..', 'dist', 'stores.json');
};

async function main(): Promise<void> {
  if (process.env.EDGE_CONFIG_SKIP_BUILD_EMBEDDING === '1') return;

  const connections = Object.values(process.env).reduce<Connection[]>(
    (acc, value) => {
      if (typeof value !== 'string') return acc;
      const data = parseConnectionString(value);
      if (data) acc.push(data);
      return acc;
    },
    [],
  );

  const outputPath = getOutputPath();

  const values = await Promise.all(
    connections.map(async (connection) => {
      const res = await fetch(connection.baseUrl, {
        headers: {
          authorization: `Bearer ${connection.token}`,
          // consistentRead
          'x-edge-config-min-updated-at': `${Number.MAX_SAFE_INTEGER}`,
        },
      });

      const ts = res.headers.get('x-edge-config-updated-at');
      const data: EmbeddedEdgeConfig = await res.json();
      return { data, updatedAt: ts ? Number(ts) : undefined };
    }),
  );

  const stores = connections.reduce<StoresJson>((acc, connection, index) => {
    const value = values[index];
    acc[connection.id] = value;
    return acc;
  }, {});

  // Ensure the dist directory exists before writing
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(stores));
  // eslint-disable-next-line no-console -- This is a CLI tool
  if (Object.keys(stores).length === 0) {
    console.error(`@vercel/edge-config: Embedded no stores`);
  } else {
    console.log(
      `@vercel/edge-config: Embedded ${Object.keys(stores).join(', ')}`,
    );
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- This is a CLI tool
  console.error('@vercel/edge-config: postinstall failed', error);
  process.exit(1);
});
