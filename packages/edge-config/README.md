# @vercel/edge-config

The official JavaScript client for reading from [Vercel Edge Config](https://vercel.com/docs/storage/edge-config) — an ultra-low latency data store for global configuration data.

## Quick Start

### Installation

```sh
npm install @vercel/edge-config
```

### Setup

1. Create an Edge Config on [vercel.com](https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fstores&title=Create+Edge+Config+Store).
2. Connect it to your project to get a connection string
3. The connection string is automatically available as `process.env.EDGE_CONFIG`

### Basic Usage

```js
import { get } from '@vercel/edge-config';

// Read a single value
const value = await get('myKey');

// Check if a key exists
import { has } from '@vercel/edge-config';
const exists = await has('myKey'); // true or false

// Read multiple values at once
import { getAll } from '@vercel/edge-config';
const values = await getAll(['keyA', 'keyB', 'keyC']);

// Read all values
const allValues = await getAll();
```

### Production Best Practices

Add Edge Config bundling for resilience and faster builds:

```json
{
  "scripts": {
    "prebuild": "edge-config snapshot"
  }
}
```

This bundles a snapshot of your Edge Config into your build as a fallback, ensuring your application continues working in the rare event the Edge Config service is temporarily unavailable.

---

## API Reference

### Default Client Functions

These functions read from the Edge Config specified in `process.env.EDGE_CONFIG`.

#### `get(key)`

Reads a single value from Edge Config.

```js
import { get } from '@vercel/edge-config';
const value = await get('myKey');
```

**Returns:**
- The value if the key exists
- `undefined` if the key does not exist

**Throws:**
- Error on invalid connection string
- Error on deleted Edge Config
- Error on network failures

#### `has(key)`

Checks if a key exists in Edge Config.

```js
import { has } from '@vercel/edge-config';
const exists = await has('myKey');
```

**Returns:**
- `true` if the key exists
- `false` if the key does not exist

**Throws:**
- Error on invalid connection string
- Error on deleted Edge Config
- Error on network failures

#### `getAll(keys?)`

Reads multiple or all values from Edge Config.

```js
import { getAll } from '@vercel/edge-config';

// Get specific keys
const some = await getAll(['keyA', 'keyB']);

// Get all keys
const all = await getAll();
```

**Parameters:**
- `keys` (optional): Array of keys to retrieve. If omitted, returns all items.

**Returns:**
- Object containing the requested key-value pairs

**Throws:**
- Error on invalid connection string
- Error on deleted Edge Config
- Error on network failures

#### `digest()`

Gets the current digest (version hash) of the Edge Config.

```js
import { digest } from '@vercel/edge-config';
const currentDigest = await digest();
```

**Returns:**
- String containing the current digest

**Throws:**
- Error on invalid connection string
- Error on deleted Edge Config
- Error on network failures

---

### Custom Client

Use `createClient()` to connect to a specific Edge Config or customize behavior.

#### `createClient(connectionString, options?)`

Creates a client instance for a specific Edge Config.

```js
import { createClient } from '@vercel/edge-config';

const client = createClient(process.env.ANOTHER_EDGE_CONFIG);
await client.get('myKey');
```

**Parameters:**

- `connectionString` (string): The Edge Config connection string
- `options` (object, optional): Configuration options

**Options:**

```ts
{
  // Fallback to stale data for N seconds if the API returns an error
  staleIfError?: number | false;
  
  // Disable the default development cache (stale-while-revalidate)
  disableDevelopmentCache?: boolean;
  
  // Control Next.js fetch cache behavior
  cache?: 'no-store' | 'force-cache';
  
  // Timeout for network requests in milliseconds
  // Falls back to bundled config if available, or throws if not
  timeoutMs?: number;
}
```

**Returns:**
- Client object with `get()`, `getAll()`, `has()`, and `digest()` methods

**Example with options:**

```js
const client = createClient(process.env.EDGE_CONFIG, {
  timeoutMs: 750,
  cache: 'force-cache',
  staleIfError: 300, // Use stale data for 5 minutes on error
});
```

#### `clone(value)`

Creates a mutable copy of a value returned from Edge Config.

```js
import { get, clone } from '@vercel/edge-config';

const value = await get('myKey');
const mutableValue = clone(value);
mutableValue.someProperty = 'new value'; // Safe to modify
```

**Why this is needed:** For performance, Edge Config returns immutable references. Mutating values directly may cause unexpected behavior. Use `clone()` when you need to modify returned values.

---

## Advanced Features

### Edge Config Bundling

Bundling creates a build-time snapshot of your Edge Config that serves as a fallback and eliminates network requests during builds.

**Setup:**

```json
{
  "scripts": {
    "prebuild": "edge-config snapshot"
  }
}
```

**Benefits:**
- Resilience: Your app continues working if Edge Config is temporarily unavailable
- Faster builds: Only a single network request needed per Edge Config during build
- Consistency: Guarantees the same Edge Config state throughout your build

**How it works:**
1. The `edge-config snapshot` command scans environment variables for connection strings
2. It fetches the latest version of each Edge Config
3. It saves them to local files that are automatically bundled by your build tool
4. The SDK automatically uses these as fallbacks when needed

### Timeouts

Set a maximum wait time for Edge Config requests:

```js
import { createClient } from '@vercel/edge-config';

const client = createClient(process.env.EDGE_CONFIG, {
  timeoutMs: 750,
});
```

**Behavior:**
- If a request exceeds the timeout, the SDK falls back to the bundled version (if available)
- If no bundled version exists, an error is thrown

**Recommendation:** Only use timeouts when you have bundling enabled or proper error handling.

### Writing to Edge Config

Edge Config is optimized for high-volume reads and infrequent writes. Update values using:

- [Vercel Dashboard](https://vercel.com/docs/concepts/edge-network/edge-config/edge-config-dashboard#manage-items-in-the-store) — Visual interface
- [Vercel API](https://vercel.com/docs/concepts/edge-network/edge-config/vercel-api#update-your-edge-config) — Programmatic updates

---

## Framework Integration

### Next.js

#### App Router (Dynamic Rendering)

By default, Edge Config triggers dynamic rendering:

```js
import { get } from '@vercel/edge-config';

export default async function Page() {
  const value = await get('myKey');
  return <div>{value}</div>;
}
```

#### App Router (Static Rendering)

To use Edge Config with static pages, enable caching:

```js
import { createClient } from '@vercel/edge-config';

const client = createClient(process.env.EDGE_CONFIG, {
  cache: 'force-cache',
});

export default async function Page() {
  const value = await client.get('myKey');
  return <div>{value}</div>;
}
```

**Note:** Static rendering may display stale values until the page is rebuilt.

#### Pages Router

```js
// pages/api/config.js
import { get } from '@vercel/edge-config';

export default async function handler(req, res) {
  const value = await get('myKey');
  res.json({ value });
}
```

#### Edge Runtime

```js
// pages/api/edge.js
import { get } from '@vercel/edge-config';

export default async function handler(req) {
  const value = await get('myKey');
  return new Response(JSON.stringify({ value }));
}

export const config = { runtime: 'edge' };
```

### Vite-Based Frameworks (Nuxt, SvelteKit, etc.)

Vite doesn't automatically expose `.env` variables on `process.env`. Choose one solution:

**Option 1: Populate `process.env` with dotenv-expand**

```sh
pnpm install --save-dev dotenv dotenv-expand
```

```js
// vite.config.js
import dotenvExpand from 'dotenv-expand';
import { loadEnv, defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    const env = loadEnv(mode, process.cwd(), '');
    dotenvExpand.expand({ parsed: env });
  }

  return {
    // Your config
  };
});
```

**Option 2: Pass connection string explicitly**

```js
// SvelteKit example
import { createClient } from '@vercel/edge-config';
import { EDGE_CONFIG } from '$env/static/private';

const client = createClient(EDGE_CONFIG);
await client.get('myKey');
```

---

## Observability

### OpenTelemetry Tracing

Enable tracing for observability:

```js
import { setTracerProvider } from '@vercel/edge-config';
import { trace } from '@opentelemetry/api';

setTracerProvider(trace);
```

For verbose traces, set the environment variable:

```sh
EDGE_CONFIG_TRACE_VERBOSE=true
```

---

## Error Handling

Edge Config throws errors in these cases:

- **Invalid connection string**: The provided connection string is malformed or invalid
- **Deleted Edge Config**: The Edge Config has been deleted
- **Network errors**: Request failed due to network issues
- **Timeout**: Request exceeded `timeoutMs` and no bundled fallback is available

**Example:**

```js
import { get } from '@vercel/edge-config';

try {
  const value = await get('myKey');
} catch (error) {
  console.error('Failed to read Edge Config:', error);
  // Handle error appropriately
}
```

---

## Important Notes

### Immutability

Values returned by `get()` and `getAll()` are immutable by default. Do not modify them directly:

```js
// BAD - Do not do this
const value = await get('myKey');
value.property = 'new value'; // Causes undefined behavior

// GOOD - Clone first
import { clone } from '@vercel/edge-config';
const value = await get('myKey');
const mutableValue = clone(value);
mutableValue.property = 'new value'; // Safe
```

**Why?** For performance, the SDK returns references to cached objects. Mutations can affect other parts of your application.

---

## Contributing

Found a bug or want to contribute?

1. [Fork this repository](https://help.github.com/articles/fork-a-repo/)
2. [Clone it locally](https://help.github.com/articles/cloning-a-repository/)
3. Link the package: `npm link`
4. In your test project: `npm link @vercel/edge-config`
5. Make your changes and run tests: `npm test`

---

## Resources

- [Edge Config Documentation](https://vercel.com/docs/edge-config)
- [Vercel Dashboard](https://vercel.com/)
- [Report Issues](https://github.com/vercel/storage/issues)
