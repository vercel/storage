#!/usr/bin/env node
/*
 * Edge Config CLI
 *
 * command: snapshot
 *   Reads all connected Edge Configs and emits them into
 *   node_modules/@vercel/edge-config-storage/stores.json along with a package.json
 *   that exports the data.json file.
 *
 *   Attaches the updatedAt timestamp from the header to the emitted file, since
 *   the endpoint does not currently include it in the response body.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { version } from '../package.json';
import type {
  BundledEdgeConfig,
  Connection,
  EmbeddedEdgeConfig,
} from '../src/types';
import {
  parseConnectionString,
  parseTimeoutMs,
} from '../src/utils/parse-connection-string';

type StoresJson = Record<string, BundledEdgeConfig>;

type PrepareOptions = {
  verbose?: boolean;
};

/**
 * Parses a connection string with the following format:
 * `flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx`
 */
function parseConnectionFromFlags(text: string): Connection | null {
  try {
    if (!text.startsWith('flags:')) return null;
    const params = new URLSearchParams(text.slice(6));

    const id = params.get('edgeConfigId');
    const token = params.get('edgeConfigToken');

    if (!id || !token) return null;

    const snapshot =
      params.get('snapshot') === 'required' ? 'required' : 'optional';

    const timeoutMs = parseTimeoutMs(params.get('timeoutMs'));

    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
      snapshot,
      timeoutMs,
    };
  } catch {
    // no-op
  }

  return null;
}

async function prepare(options: PrepareOptions): Promise<void> {
  const connections = Object.values(process.env).reduce<Connection[]>(
    (acc, value) => {
      if (typeof value !== 'string') return acc;
      const data = parseConnectionString(value);
      if (data) acc.push(data);

      const vfData = parseConnectionFromFlags(value);
      if (vfData) acc.push(vfData);

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
          'user-agent': `@vercel/edge-config@${version} (prepare)`,
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

  // Determine the output directory in node_modules
  // Start from current working directory (the customer's app) and find node_modules
  const storageDir = join(
    process.cwd(),
    'node_modules',
    '@vercel',
    'edge-config-storage',
  );
  const dataPath = join(storageDir, 'data.json');
  const pkgPath = join(storageDir, 'package.json');

  // Ensure the storage directory exists
  await mkdir(storageDir, { recursive: true });

  // Write the data.json file
  await writeFile(dataPath, JSON.stringify(stores));

  // Create a package.json that exports data.json
  const packageJson = {
    name: '@vercel/edge-config-storage',
    version: '1.0.0',
    type: 'module',
    exports: {
      './data.json': './data.json',
    },
  };
  await writeFile(pkgPath, JSON.stringify(packageJson, null, 2));

  if (options.verbose) {
    console.log(`@vercel/edge-config snapshot`);
    console.log(`  → created ${dataPath}`);
    console.log(`  → created ${pkgPath}`);
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
  .command('snapshot')
  .description(
    'Capture point-in-time snapshots of Edge Configs. ' +
      'Ensures consistent values during build, enables instant bootstrapping, ' +
      'and provides fallback when the service is unavailable.',
  )
  .option('--verbose', 'Enable verbose logging')
  .action(async (options: PrepareOptions) => {
    if (process.env.EDGE_CONFIG_SKIP_PREPARE_SCRIPT === '1') return;

    await prepare(options);
  });

program.parse();
