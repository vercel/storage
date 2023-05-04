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

`@vercel/postgres` is zero-config for platforms where `process.env` is available. It is _technically_ available in Vite, but one major caveat: **Vite only reads variables starting with `VITE_` from your `.env` files -- this is to avoid accidentally bundling your secrets into client code**. Practically, this means that this library _will_ work zero-config when deployed to production (where `process.env` is available on the server, but not on the client), but will _not_ work while you're developing locally, because Vite will not add your environment variables (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, etc) from your `.env` file.

To combat this, you have one of two options:

#### Add dotenv-expand to your dev command (but _not_ your build command!)

This will load your sensitive environment variables into `process.env` during dev, but allow Vite to safely omit them during build.

```shell
pnpm install --save-dev dotenv dotenv-expand
```

```js
// an example vite.config.js from a SvelteKit app
import { sveltekit } from '@sveltejs/kit/vite';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // This check is important!
  if (mode === 'development') {
    const env = dotenv.config();
    dotenvExpand.expand(env);
  }

  return {
    plugins: [sveltekit()],
  };
});
```

#### Configure your client manually

If you're developing in a framework that provides private environment variable access, such as SvelteKit, instead of relying on `@vercel/postgres` to find your config via environment variables, you can feed it the values it needs (here's an example from earlier):

```diff
import { createPool } from '@vercel/postgres';
+ import { POSTGRES_URL } from '$env/static/private';

import { createPool } from '@vercel/postgres';
const pool = createPool({
-  /* config */
+  connectionString: POSTGRES_URL
});
```
