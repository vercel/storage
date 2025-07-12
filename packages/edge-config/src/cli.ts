#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import type { Connection, EmbeddedEdgeConfig } from './types';
import { parseConnectionString } from './utils';

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

  await mkdir('/tmp/edge-config', { recursive: true });

  await Promise.all(
    connections.map(async (connection) => {
      const data = await fetch(connection.baseUrl, {
        headers: {
          authorization: `Bearer ${connection.token}`,
          // consistentRead
          'x-edge-config-min-updated-at': `${Number.MAX_SAFE_INTEGER}`,
        },
      }).then((res) => res.json() as Promise<EmbeddedEdgeConfig>);

      await writeFile(
        `/tmp/edge-config/${connection.id}.json`,
        JSON.stringify(data),
      );
    }),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- This is a CLI tool
  console.error('@vercerl/edge-config: prepare failed', error);
  process.exit(1);
});
