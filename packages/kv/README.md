# @vercel/kv

A client that works with Vercel KV.

## Install

```sh
npm install @vercel/kv

```

## Usage

```js
import kv from '@vercel/kv';

// string
await kv.set('key', 'value');
let data = await kv.get('key');
console.log(data); // 'value'

await kv.set('key2', 'value2', { ex: 1 });

// sorted set
await kv.zadd(
  'scores',
  { score: 1, member: 'team1' },
  { score: 2, member: 'team2' },
);
data = await kv.zrange('scores', 0, 0);
console.log(data); // [ 'team1' ]

// list
await kv.lpush('elements', 'magnesium');
data = await kv.lrange('elements', 0, 100);
console.log(data); // [ 'magnesium' ]

// hash
await kv.hset('people', { name: 'joe' });
data = await kv.hget('people', 'name');
console.log(data); // 'joe'

// sets
await kv.sadd('animals', 'cat');
data = await kv.spop('animals', 1);
console.log(data); // [ 'cat' ]

// scan for keys
for await (const key of kv.scanIterator()) {
  console.log(key);
}
```

### Custom Environment Variables

By default `@vercel/kv` reads the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables. Use the following function in case you need to define custom values

```js
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: 'https://<hostname>.redis.vercel-storage.com',
  token: '<token>',
});

await kv.set('key', 'value');
```

## Docs

See the [documentation](https://www.vercel.com/docs/storage/vercel-kv) for details.

### A note for Vite users

`@vercel/kv` is zero-config for platforms where `process.env` is available. It is _technically_ available in Vite, but one major caveat: **Vite only reads variables starting with `VITE_` from your `.env` files -- this is to avoid accidentally bundling your secrets into client code**. Practically, this means that this library _will_ work zero-config when deployed to production (where `process.env` is available on the server, but not on the client), but will _not_ work while you're developing locally, because Vite will not add your environment variables (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, etc) from your `.env` file.

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

If you're developing in a framework that provides private environment variable access, such as SvelteKit, instead of relying on `@vercel/kv` to find your config via environment variables, you can feed it the values it needs (here's an example from earlier):

```diff
import { createClient } from '@vercel/kv';
+ import { KV_URL, KV_REST_API_TOKEN } from '$env/static/private';

const kv = createClient({
-  url: 'https://<hostname>.redis.vercel-storage.com',
-  token: '<token>',
+  url: KV_URL,
+  token: KV_REST_API_TOKEN,
});

await kv.set('key', 'value');
```
