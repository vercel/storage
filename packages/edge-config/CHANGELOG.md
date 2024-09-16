# @vercel/edge-config

## 1.3.0

### Minor Changes

- aaec8c5: Support new connection string format

## 1.2.1

### Patch Changes

- 3057a36: gracefully handle when an empty string is supplied as the key

  - `get("")` will return `undefined`
  - `has("")` will return `false`
  - `getAll(["a", ""])` will ignore the empty string

## 1.2.0

### Minor Changes

- 6a592b5: allow setting fetch cache behaviour

### Patch Changes

- 6a592b5: remove DeepReadOnly type

## 1.1.1

### Patch Changes

- 585a753: Resolved bug where an unhandled promise rejection event may have been triggered during development

## 1.1.0

### Minor Changes

- 5fb6969: Make `@opentelemetry/api` optional and expose a `setTracerProvider` function

## 1.0.2

### Patch Changes

- 78d5814: prevents having too many open connections

## 1.0.1

### Patch Changes

- 4e7e216: mark @opentelemetry/api as optional peer dependency

## 1.0.0

### Major Changes

- fcdc55e: - **BREAKING CHANGE** Return values are now read-only to improve in-memory caching

  It used to be possible to change the returned value as shown in this example:

  ```typescript
  import { get } from '@vercel/edge-config';
  const countries = await get('allowedCountryCodes');
  countries.DE = true; // Will now cause TypeScript to error
  ```

  Moving forward, modifications like the above will cause a type error.

  If there is a need to modify the value, then the `clone` function can be used to clone the data and make it modifiable.

  ```typescript
  import { get, clone } from '@vercel/edge-config';

  const myArray = await get('listOfAllowedIPs');
  const myArrayClone = clone(myArray); // Clones the data to make it modifiable
  myArrayClone.push('127.0.0.1'); // The `push` operation will work now
  ```

  - **BREAKING CHANGE** SDK now throws underlying errors

    Previous versions of the `@vercel/edge-config` package would catch most errors thrown by native functions and throw a generic network error instead - even if the underlying issue wasn't a network error. The new version will throw the original errors.

    **Note** applications which rely on the `@vercel/edge-config: Unexpected error` and `@vercel/edge-config: Network error` errors must adapt to the new implementation by ensuring other types of errors are handled as well.

  - The SDK now uses stale-while-revalidate semantics during development

    When `@vercel/edge-config` is used during development, with `NODE_ENV` being set to `development`, any read operation will fetch the entire Edge Config once and keep it in-memory to quickly resolve all other read operations for other keys, without waiting for the network. Subsequent reads will update the in-memory data in the background.

    This behaviour can be disabled by setting the environment variable `EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR` to `1`, or by using the `disableDevelopmentCache` option on the `createClient` function.

## 0.4.1

### Patch Changes

- 3105f2b: make parseConnectionString parse both internal and external connection strings
- d90e973: Removed `"types"` field from package.json to support `"moduleResolution": "Node16"`

## 0.4.0

### Minor Changes

- e01f1ef: add stale-if-error semantics

## 0.3.0

### Minor Changes

- cedd4b9: adds connection info to edge config clients

## 0.2.1

### Patch Changes

- 97a3d06: Add `x-edge-config-vercel-env` and `x-edge-config-sdk` headers to requests

## 0.2.0

### Minor Changes

- 7944205: support third-party connection strings

## 0.1.11

### Patch Changes

- d224a2a: add JSDoc comments
- 490a976: internal rewrite - no functionality should have changed
- 282b5ee: work around an issue which prevented edge config from being read via async page components in app router on the nodejs runtime

## 0.1.11-canary.1

### Patch Changes

- 282b5ee: work around an issue which prevented edge config from being read via async page components in app router on the nodejs runtime

## 0.1.11-canary.0

### Patch Changes

- 490a976: internal rewrite - no functionality should have changed

## 0.1.10

### Patch Changes

- c4a8aa5: feat: Docs section for Vite environment config

## 0.1.9

### Patch Changes

- 1ade1f0: chore: Update package.json and licenses

## 0.1.8

### Patch Changes

- 7a3a45b: prevent has() from failing on subsequent invocations

## 0.1.8-canary.0

### Patch Changes

- 7a3a45b: prevent has() from failing on subsequent invocations

## 0.1.7

### Patch Changes

- b8d26e9: read body to avoid memory leaks

## 0.1.6

### Patch Changes

- 523f7a7: accept interfaces as generic types of get<T> and getAll<T>
- becf6bf: add cache: no-store to fetch requests

## 0.1.6-canary.0

### Patch Changes

- becf6bf: add cache: no-store to fetch requests

## 0.1.5

### Patch Changes

- af5f776: explicitly target edge-light runtime environment

## 0.1.5-canary.0

### Patch Changes

- af5f776: explicitly target edge-light runtime environment

## 0.1.4

### Patch Changes

- 2df8aac: avoid reusing ReadableStream across request contexts

## 0.1.3

### Patch Changes

- 419c38e: adds an etag based cache to reduce latency and bandwidth

## 0.1.2

### Patch Changes

- 6047c1d: make `get()` and `getAll()` return type EdgeConfigValue instead of any, kudos @jzxhuang
- 9aadcf8: upgrade dependencies
- 4f93dad: Removes main and module fields to force the use of the exports field
- 868f702: split bundles into edge-runtime and node

## 0.1.2-bundling.3

### Patch Changes

- 4f93dad: Removes main and module fields to force the use of the exports field

## 0.1.2-bundling.2

### Patch Changes

- 9aadcf8: upgrade dependencies

## 0.1.2-bundling.1

### Patch Changes

- 6047c1d: make `get()` and `getAll()` return type EdgeConfigValue instead of any, kudos @jzxhuang

## 0.1.2-bundling.0

### Patch Changes

- 868f702: split bundles into edge-runtime and node

## 0.1.1

### Patch Changes

- b870314: support calling getAll() without any arguments

## 0.1.0

If you were already on 0.1.0-canary.15 there are no breaking changes for you.
This is an identical version, just without the canary tag.

### Minor Changes

- 578d34a: pass version via search param
- b8ae62b: Allow reading embedded edge configs
- edf1cc9: Add getAll() method

  - `getAll()` allows fetching all items of an Edge Config
  - `getAll(keys: string[])` allows fetching a subset of the Edge Config's items

  Use `process.env.EDGE_CONFIG` instead of `process.env.VERCEL_EDGE_CONFIG` for the default Edge Config.

- 888b861: drop cjs support
- b614218: drop esm support
- 81bfed2: renamedcreateEdgeConfigClient to createClient
- 667c121: drop /config

### Patch Changes

- 5432011: add README
- 0c78c58: use URL instead of URLPattern to support node
- 311fedd: loosen edge config item value type to be "any"
- f5a7354: fix digest response body parsing as it has changed upstream
- 99ac8af: access edge config via renamed folder
- 85fb6ac: silence dependency expression warning
- a048274: export esm
- 264ab8d: Throw when attempting to read value of non-existing Edge Config
- 888b861: fix dynamic import by adding webpackIgnore comment
- 7cb351a: replace dynamic import with fs
- 5aabd54: make package publicly available again
- 0e79aa3: renames matchEdgeConfigConnectionString to parseConnectionString
- a048274: use dynamic import
- d0c55ee: add descriptive README
- 9bf7828: avoid build time warning aboud Node.js module being loaded when used in Next.js

## 0.1.0-canary.15

### Patch Changes

- 5432011: add README

## 0.1.0-canary.14

### Patch Changes

- f5a7354: fix digest response body parsing as it has changed upstream
- 0e79aa3: renames matchEdgeConfigConnectionString to parseConnectionString

## 0.1.0-canary.13

### Minor Changes

- 667c121: drop /config

## 0.1.0-canary.12

### Patch Changes

- 0c78c58: use URL instead of URLPattern to support node

## 0.1.0-canary.11

### Minor Changes

- 578d34a: pass version via search param
- 81bfed2: renamedcreateEdgeConfigClient to createClient

### Patch Changes

- 99ac8af: access edge config via renamed folder

## 0.1.0-canary.10

### Patch Changes

- 85fb6ac: silence dependency expression warning

## 0.1.0-canary.9

### Patch Changes

- 9bf7828: avoid build time warning aboud Node.js module being loaded when used in Next.js

## 0.1.0-canary.8

### Patch Changes

- 7cb351a: replace dynamic import with fs

## 0.1.0-canary.7

### Minor Changes

- 888b861: drop cjs support

### Patch Changes

- 888b861: fix dynamic import by adding webpackIgnore comment

## 0.1.0-canary.6

### Patch Changes

- a048274: export esm
- a048274: use dynamic import

## 0.1.0-canary.5

### Patch Changes

- 311fedd: loosen edge config item value type to be "any"

## 0.1.0-canary.4

### Minor Changes

- b614218: drop esm support

## 0.1.0-canary.3

### Patch Changes

- 5aabd54: make package publicly available again

## 0.1.0-canary.2

### Minor Changes

- edf1cc9: Add getAll() method

  - `getAll()` allows fetching all items of an Edge Config
  - `getAll(keys: string[])` allows fetching a subset of the Edge Config's items

### Patch Changes

- 264ab8d: Throw when attempting to read value of non-existing Edge Config

## 0.1.0-canary.1

### Minor Changes

- Allow reading embedded edge configs
