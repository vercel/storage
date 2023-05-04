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

## A note for Vite users

`@vercel/kv` reads database credentials from `process.env`. With some tools, process.env is automatically populated from your `.env` file during development (created when you run `vc env pull`), but Vite does not expose `.env` variables on `process.env.`

You can fix this in one of two ways. Firstly, you can populate `process.env` yourself using something like `dotenv-expand`:

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
    const env = loadEnv(mode);
    dotenvExpand.expand(env);
  }

  return {
    ...
  };
});
```

Secondly, you can provide the credentials explicitly, instead of relying on zero-config setup. For example, here's how you could create a client in SvelteKit, which makes private environment variables available via `$env/static/private`:

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
