#!/usr/bin/env node
/*
 * Edge Config CLI
 *
 * command: prepare
 *   Reads all connected Edge Configs and emits a single stores.json file.
 *   that can be accessed at runtime by the mockable-import function.
 *
 *   Attaches the updatedAt timestamp from the header to the emitted file, since
 *   the endpoint does not currently include it in the response body.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { version } from '../package.json';
import type {
  BundledEdgeConfig,
  Connection,
  EmbeddedEdgeConfig,
} from '../src/types';
import { parseConnectionString } from '../src/utils/parse-connection-string';

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type StoresJson = Record<string, BundledEdgeConfig>;

type PrepareOptions = {
  verbose?: boolean;
};

async function prepare(output: string, options: PrepareOptions): Promise<void> {
  const connections = Object.values(process.env).reduce<Connection[]>(
    (acc, value) => {
      if (typeof value !== 'string') return acc;
      const data = parseConnectionString(value);
      if (data) acc.push(data);
      return acc;
    },
    [],
  );

  const values: BundledEdgeConfig[] = await Promise.all(
    connections.map<Promise<BundledEdgeConfig>>(async (connection) => {
      const res = await fetch(connection.baseUrl, {
        headers: {
          authorization: `Bearer ${connection.token}`,
          // consistentRead
          'x-edge-config-min-updated-at': `${Number.MAX_SAFE_INTEGER}`,
        },
      });

      if (!res.ok) {
        throw new Error(
          `@vercel/edge-config: Failed to prepare edge config ${connection.id}: ${res.status} ${res.statusText}`,
        );
      }

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
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(stores));
  if (options.verbose) {
    console.log(`@vercel/edge-config prepare`);
    console.log(`  → created ${output}`);
    if (Object.keys(stores).length === 0) {
      console.log(`  → no edge configs included`);
    } else {
      console.log(`  → included ${Object.keys(stores).join(', ')}`);
    }
  }
}

const program = new Command();
program
  .name('@vercel/edge-config')
  .description('Vercel Edge Config CLI')
  .version(version);

program
  .command('prepare')
  .description('Prepare Edge Config stores.json file for build time embedding')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options: PrepareOptions) => {
    const output = join(__dirname, '..', 'dist', 'stores.json');
    await prepare(output, options);
  });

program.parse();
