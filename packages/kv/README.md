# @vercel/kv

A client that works with Vercel KV.

## Install

```sh
npm install @vercel/kv

```

## Usage

```js
import { kv } from '@vercel/kv';

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

### Automatic Deserialization

The default `kv` client automatically deserializes values returned from the database via `JSON.parse`. If this behaviour is undesired, create a custom KV client via the `createClient` method with `automaticDeserialization: false`. All data will be returned as strings.

```js
import { kv, createClient } from '@vercel/kv';

const customKvClient = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
  automaticDeserialization: false,
});

await customKvClient.set('object', { hello: 'world' });

console.log(await kv.get('object')); // { hello: 'world' }
console.log(await customKvClient.get('object')); // '{"hello":"world"}'
```

## Docs

See the [documentation](https://www.vercel.com/docs/storage/vercel-kv) for details.

## A note for Vite users

`@vercel/kv` reads database credentials from the environment variables on `process.env`. In general, `process.env` is automatically populated from your `.env` file during development, which is created when you run `vc env pull`. However, Vite does not expose the `.env` variables on `process.env.`

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
import { createClient } from '@vercel/kv';
+ import { KV_REST_API_URL, KV_REST_API_TOKEN } from '$env/static/private';

const kv = createClient({
-  url: 'https://<hostname>.redis.vercel-storage.com',
-  token: '<token>',
+  url: KV_REST_API_URL,
+  token: KV_REST_API_TOKEN,
});

await kv.set('key', 'value');
```

## FAQ

### Does the `@vercel/kv` package support [Redis Streams](https://redis.io/docs/data-types/streams/)?

No, the `@vercel/kv` package does not support Redis Streams. To use Redis Streams with Vercel KV, you must connect directly to the database server via packacges like [`io-redis`](https://github.com/redis/ioredis) or [`node-redis`](https://github.com/redis/node-redis).

```js
import { createClient } from 'redis';

const client = createClient({
  url: process.env.KV_URL,
});

await client.connect();
await client.xRead({ key: 'mystream', id: '0' }, { COUNT: 2 });
```
