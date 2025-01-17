# @vercel/edge-config

![Edge Runtime Compatible](https://img.shields.io/badge/edge--runtime-%E2%9C%94%20compatible-black)

A client that lets you read Edge Config.

## Installation

```sh
npm install @vercel/edge-config
```

## Examples

You can use the methods below to read your Edge Config given you have its Connection String stored in an Environment Variable called `process.env.EDGE_CONFIG`.

### Reading a value

```js
import { get } from '@vercel/edge-config';
await get('someKey');
```

Returns the value if the key exists.
Returns `undefined` if the key does not exist.
Throws on invalid tokens, deleted edge configs or network errors.

### Checking if a key exists

```js
import { has } from '@vercel/edge-config';
await has('someKey');
```

Returns `true` if the key exists.
Returns `false` if the key does not exist.
Throws on invalid tokens, deleted edge configs or network errors.

### Reading all items

```js
import { getAll } from '@vercel/edge-config';
await getAll();
```

Returns all Edge Config items.
Throws on invalid tokens, deleted edge configs or network errors.

### Reading items in batch

```js
import { getAll } from '@vercel/edge-config';
await getAll(['keyA', 'keyB']);
```

Returns selected Edge Config items.
Throws on invalid tokens, deleted edge configs or network errors.

### Default behaviour

By default `@vercel/edge-config` will read from the Edge Config stored in `process.env.EDGE_CONFIG`.

The exported `get`, `getAll`, `has` and `digest` functions are bound to this default Edge Config Client.

### Reading a value from a specific Edge Config

You can use `createClient(connectionString)` to read values from Edge Configs other than the default one.

```js
import { createClient } from '@vercel/edge-config';
const edgeConfig = createClient(process.env.ANOTHER_EDGE_CONFIG);
await edgeConfig.get('someKey');
```

The `createClient` function connects to a any Edge Config based on the provided Connection String.

It returns the same `get`, `getAll`, `has` and `digest` functions as the default Edge Config Client exports.

### Making a value mutable

By default, the value returned by `get` and `getAll` is immutable. Modifying the object might cause an error or other undefined behaviour.

In order to make the returned value mutable, you can use the exported function `clone` to safely clone the object and make it mutable.

## Writing Edge Config Items

Edge Config Items can be managed in two ways:

- [Using the Dashboard on vercel.com](https://vercel.com/docs/concepts/edge-network/edge-config/edge-config-dashboard#manage-items-in-the-store)
- [Using the Vercel API](https://vercel.com/docs/concepts/edge-network/edge-config/vercel-api#update-your-edge-config)

Keep in mind that Edge Config is built for very high read volume, but for infrequent writes.

## Features

- Works in [Edge Runtime](https://edge-runtime.vercel.sh/), [Node.js](https://nodejs.org) and in the browser

## Error Handling

- An error is thrown in case of a network error
- An error is thrown in case of an unexpected response

## Edge Runtime Support

`@vercel/edge-config` is compatible with the [Edge Runtime](https://edge-runtime.vercel.app/). It can be used inside environments like [Vercel Edge Functions](https://vercel.com/edge) as follows:

```js
// Next.js (pages/api/edge.js) (npm i next@canary)
// Other frameworks (api/edge.js) (npm i -g vercel@canary)

import { get } from '@vercel/edge-config';

export default (req) => {
  const value = await get("someKey")
  return new Response(`someKey contains value "${value})"`);
};

export const config = { runtime: 'edge' };
```

## OpenTelemetry Tracing

The `@vercel/edge-config` package makes use of the OpenTelemetry standard to trace certain functions for observability. In order to enable it, use the function `setTracerProvider` to set the `TracerProvider` that should be used by the SDK.

```js
import { setTracerProvider } from '@vercel/edge-config';
import { trace } from '@opentelemetry/api';

setTracerProvider(trace);
```

More verbose traces can be enabled by setting the `EDGE_CONFIG_TRACE_VERBOSE` environment variable to `true`.

## Fetch cache

By default the Edge Config SDK will fetch with `no-store`, which triggers dynamic mode in Next.js ([docs](https://nextjs.org/docs/app/api-reference/functions/fetch#optionscache)).

To use Edge Config with static pages, pass the `force-cache` option:

```js
import { createClient } from '@vercel/edge-config';

const edgeConfigClient = createClient(process.env.EDGE_CONFIG, {
  cache: 'force-cache',
});

// then use the client as usual
edgeConfigClient.get('someKey');
```

**Note** This opts out of dynamic behavior, so the page might display stale values.

## Notes

### Do not mutate return values

Cloning objects in JavaScript can be slow. That's why the Edge Config SDK uses an optimization which can lead to multiple calls reading the same key all receiving a reference to the same value.

For this reason the value read from Edge Config should never be mutated, otherwise they could affect other parts of the code base reading the same key, or a later request reading the same key.

If you need to modify, see the `clone` function described [here](#do-not-mutate-return-values).

### Usage with Vite

`@vercel/edge-config` reads database credentials from the environment variables on `process.env`. In general, `process.env` is automatically populated from your `.env` file during development, which is created when you run `vc env pull`. However, Vite does not expose the `.env` variables on `process.env.`

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
import { createClient } from '@vercel/edge-config';
+ import { EDGE_CONFIG } from '$env/static/private';

- const edgeConfig = createClient(process.env.ANOTHER_EDGE_CONFIG);
+ const edgeConfig = createClient(EDGE_CONFIG);
await edgeConfig.get('someKey');
```

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Link the package to the global module directory: `npm link`
3. Within the module you want to test your local development instance of `@vercel/edge-config`, just link it to the dependencies: `npm link @vercel/edge-config`. Instead of the default one from npm, Node.js will now use your clone of `@vercel/edge-config`!

As always, you can run the tests using: `npm test`
