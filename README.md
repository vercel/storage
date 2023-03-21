# @vercel/edge-config

![CI](https://github.com/vercel/edge-config/workflows/CI/badge.svg)
![Edge Runtime Compatible](https://img.shields.io/badge/edge--runtime-%E2%9C%94%20compatible-black)

A client that lets you read Edge Config.

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

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Link the package to the global module directory: `npm link`
3. Within the module you want to test your local development instance of `@vercel/edge-config`, just link it to the dependencies: `npm link @vercel/edge-config`. Instead of the default one from npm, Node.js will now use your clone of `@vercel/edge-config`!

As always, you can run the tests using: `npm test`
