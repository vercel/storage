# @vercel/postgres

A client that works with Vercel Postgres.

## Quick Start

**Note:** If you want to use an ORM instead of writing your own queries, see [@vercel/postgres-kysely](https://npmjs.org/package/@vercel/postgres-kysely).

### Install

```bash
pnpm install @vercel/postgres
```

### Importing

```typescript
// Don't need any custom config?:
import { sql } from '@vercel/postgres';
// `sql` is already set up and ready to go; no further action needed

// Need to customize your config?:
import { createPool } from '@vercel/postgres';
const pool = createPool({
  /* config */
});

// Need a single client?:
import { createClient } from '@vercel/postgres';
const client = createClient({
  /* config */
});
```

### Querying

```typescript
// no-config
import { sql } from '@vercel/postgres';

const id = 100;

// A one-shot query
const { rows } = await sql`SELECT * FROM users WHERE id = ${userId};`;

// Multiple queries on the same connection (improves performance)
// warning: Do not share clients across requests and be sure to release them!
const client = await sql.connect();
const { rows } = await client.sql`SELECT * FROM users WHERE id = ${userId};`;
await client.sql`UPDATE users SET status = 'satisfied' WHERE id = ${userId};`;
client.release();
```

The `sql` import in the query above is just a modified `Pool` object (that's why you can call it). If you're running a custom config with `createPool`, the same functionality is available as `pool.sql`.

To specify a connection string:

```typescript
import { createPool } from '@vercel/postgres';

const pool = createPool({
  connectionString: process.env.SOME_POSTGRES_CONNECTION_STRING,
});

const likes = 100;
const { rows, fields } =
  await pool.sql`SELECT * FROM posts WHERE likes > ${likes};`;
```

### A note on edge environments

In edge environments, IO connections cannot be reused between requests. To allow your `Pool`s to continue to function, we set `maxUses` to 1 when running on the edge (otherwise the `Pool` might hold on to a `Client` used in one request and try to use it again in another). Unfortunately, this means the `Pool` _also_ can't reuse the connection _within_ the request. For this reason, if you're firing more than one database query to serve a single request in your app, we recommend obtaining a `Client` from `Pool.connect`, using that `Client` to query the database, and then releasing it.

### Get the connection url

If you just want the connection URL, you can call `postgresConnectionString(type: 'pool' | 'direct'): string;`. This will read from your environment variables. For the `pool` type, it will look for the `POSTGRES_URL` environment variables. For the `direct` type, it will look for the `POSTGRES_URL_NON_POOLING` environment variables.

```typescript
import { postgresConnectionString } from '@vercel/postgres';

const pooledConnectionString = postgresConnectionString('pool');
const directConnectionString = postgresConnectionString('direct');
```

### Connection Config

When using the `createClient` or `createPool` functions, you can pass in additional options alongside the connection string that conforms to `VercelPostgresClientConfig` or `VercelPostgresPoolConfig`.

### Documentation

The `@vercel/postgres` package uses the `pg` package. For
more detailed documentation, checkout [node-postgres](https://node-postgres.com/).

### A note for Vite users

`@vercel/postgres` reads database credentials from the environment variables on `process.env`. In general, `process.env` is automatically populated from your `.env` file during development, which is created when you run `vc env pull`. However, Vite does not expose the `.env` variables on `process.env.`

You can fix this in **one** of following two ways:

1. You can populate `process.env` yourself using something like `dotenv-expand`:

```shell
pnpm install --save-dev dotenv dotenv-expand
```

```js
// vite.config.js
import dotenvExpand from 'dotenv-expand';
import { loadEnv, defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // This check is important!
  if (mode === 'development') {
    const env = loadEnv(mode, process.cwd(), '');
    dotenvExpand.expand({ parsed: env });
  }

  return {
    ...
  };
});
```

2. You can provide the credentials explicitly, instead of relying on a zero-config setup. For example, this is how you could create a client in SvelteKit, which makes private environment variables available via `$env/static/private`:

```diff
import { createPool } from '@vercel/postgres';
+ import { POSTGRES_URL } from '$env/static/private';

import { createPool } from '@vercel/postgres';
const pool = createPool({
-  /* config */
+  connectionString: POSTGRES_URL
});
```
