# @vercel/edge-config

![CI](https://github.com/vercel/edge-config/workflows/CI/badge.svg)
![Edge Runtime Compatible](https://img.shields.io/badge/edge--runtime-%E2%9C%94%20compatible-black)

Use this package to easily read Edge Config items.

## Examples

### Reading a value

```js
import { get } from '@vercel/edge-config';
await get('someKey');
```

Returns the value if the key exists.
Returns `undefined` if the key does not exist.
Throws on network errors.

### Checking if a key exists

```js
import { has } from '@vercel/edge-config';
await has('someKey');
```

Returns `true` if the key exists.
Returns `false` if the key does not exist.
Throws on network errors.

### Default behaviour

By default `@vercel/edge-config` will read from the Edge Config stored in `process.env.VERCEL_EDGE_CONFIG`.

The exported `get`, `has` and `digest` functions are bound to this default Edge Config.

### Reading a value from a specific Edge Config

You can use `createEdgeConfig()` to read values from Edge Configs other than the default one.

```js
import { createEdgeConfig } from '@vercel/edge-config';
const edgeConfig = createEdgeConfig(process.env.ANOTHER_EDGE_CONFIG_URL);
await edgeConfig.get('someKey');
```

The `createEdgeConfig` function connnects to a any Edge Config based on the provided URL.

It returns the same `get`, `has` and `exists` functions as the default Edge Config exports.

## Features

- Works in [Node.js](https://nodejs.org) and in the browser
- If a value does not exist, `undefined` is returned
-
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

export const config = {
  runtime: 'experimental-edge',
};
```

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Link the package to the global module directory: `npm link`
3. Within the module you want to test your local development instance of `@vercel/edge-config`, just link it to the dependencies: `npm link @vercel/edge-config`. Instead of the default one from npm, Node.js will now use your clone of `@vercel/edge-config`!

As always, you can run the tests using: `npm test`
