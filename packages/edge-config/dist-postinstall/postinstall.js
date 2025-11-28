// scripts/postinstall.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// src/utils/parse-connection-string.ts
function parseVercelConnectionStringFromUrl(text) {
  try {
    const url = new URL(text);
    if (url.host !== 'edge-config.vercel.com') return null;
    if (url.protocol !== 'https:') return null;
    if (!url.pathname.startsWith('/ecfg')) return null;
    const id = url.pathname.split('/')[1];
    if (!id) return null;
    const token = url.searchParams.get('token');
    if (!token || token === '') return null;
    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
    };
  } catch {
    return null;
  }
}
function parseConnectionFromQueryParams(text) {
  try {
    if (!text.startsWith('edge-config:')) return null;
    const params = new URLSearchParams(text.slice(12));
    const id = params.get('id');
    const token = params.get('token');
    if (!id || !token) return null;
    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
    };
  } catch {}
  return null;
}
function parseExternalConnectionStringFromUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    let id = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    const version = url.searchParams.get('version') || '1';
    if (!id || url.pathname.startsWith('/ecfg_')) {
      id = url.pathname.split('/')[1] || null;
    }
    if (!id || !token) return null;
    url.search = '';
    return {
      type: 'external',
      baseUrl: url.toString(),
      id,
      token,
      version,
    };
  } catch {
    return null;
  }
}
function parseConnectionString(connectionString) {
  return (
    parseConnectionFromQueryParams(connectionString) ||
    parseVercelConnectionStringFromUrl(connectionString) ||
    parseExternalConnectionStringFromUrl(connectionString)
  );
}

// scripts/postinstall.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var getOutputPath = () => {
  return join(__dirname, '..', 'dist', 'stores.json');
};
async function main() {
  if (process.env.EDGE_CONFIG_SKIP_BUILD_EMBEDDING === '1') return;
  const connections = Object.values(process.env).reduce((acc, value) => {
    if (typeof value !== 'string') return acc;
    const data = parseConnectionString(value);
    if (data) acc.push(data);
    return acc;
  }, []);
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
      const data = await res.json();
      return { data, updatedAt: ts ? Number(ts) : void 0 };
    }),
  );
  const stores = connections.reduce((acc, connection, index) => {
    const value = values[index];
    acc[connection.id] = value;
    return acc;
  }, {});
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(stores));
  if (Object.keys(stores).length === 0) {
    console.error(`@vercel/edge-config: Embedded no stores`);
  } else {
    console.log(
      `@vercel/edge-config: Embedded ${Object.keys(stores).join(', ')}`,
    );
  }
}
main().catch((error) => {
  console.error('@vercel/edge-config: postinstall failed', error);
  process.exit(1);
});
//# sourceMappingURL=postinstall.js.map
