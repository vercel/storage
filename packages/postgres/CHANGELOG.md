# @vercel/postgres

## 0.8.0

### Minor Changes

- e36fa70: feat(types): re-export pg-types for Drizzle

## 0.7.2

### Patch Changes

- 5d84a4a: chore(deps): update dependency kysely to v0.27.2

## 0.7.1

### Patch Changes

- abfdf65: fix(deps): update dependency @neondatabase/serverless to v0.7.2

## 0.5.1

### Patch Changes

- 4e8161a: chore(deps): update dependency @neondatabase/serverless to v0.6.0

## 0.5.0

### Minor Changes

- 4701d58: Upgrade neon to latest, reverts cache-control on request to undefined

## 0.4.2

### Patch Changes

- d90e973: Removed `"types"` field from package.json to support `"moduleResolution": "Node16"`

## 0.4.1

### Patch Changes

- 6104c9f: Upgrade to latest neon database driver

## 0.4.0

### Minor Changes

- Upgrade @neon/serverless to the latest version
  Automatically uses @neon http layer with Pool.query/sql``
  Stop minifying and add sourcemaps for better debugging

## 0.3.2

### Patch Changes

- 52ce540: Before this release, when using our default pooling client (`import { sql } from '@vercel/storage'`), and deploying on Vercel Edge Functions,
  then your Edge Functions would timeout after 11 requests.

  Full explanation: we set node-postgres Pool `maxUses` parameter to `1` in Edge Function, because clients can't be reused between requests in this serverless context.
  This combined with how our module is made (a JavaScript proxy) triggered a specific condition where clients would never be released to the Pool.

  The exact line that failed under these circumstances was: https://github.com/brianc/node-postgres/blob/735683c5cb41bcbf043c6490be4b7f38cfe3ac48/packages/pg-pool/index.js#L166

  This is now fixed, thanks @cramforce.

## 0.3.1

### Patch Changes

- cec1d6b: Upgrade @neondatabase/serverless to 0.4.11

## 0.3.0

### Minor Changes

- 34defd9: feat: Allow users to connect to local databases

## 0.2.1

### Patch Changes

- 6b8b7a9: fix: Make it even harder to call `sql` incorrectly

## 0.2.0

### Minor Changes

- 18b69a5: feat: Prevent incorrect usage of tagged literal `sql` for non-ts users

### Patch Changes

- 8b51d48: chore: Simplify `sqlTemplate`
- c4a8aa5: feat: Docs section for Vite environment config

## 0.1.3

### Patch Changes

- 1ade1f0: chore: Update package.json and licenses

## 0.1.2

### Patch Changes

- f41b5e0: Fix licensing

## 0.1.1

### Patch Changes

- 312a0b7: chore: We're live!

## 0.1.0

### Patch Changes

- 6445b6d: Make VercelClients in VercelPool
- e1d2446: fix: Lockfile...?
- 10c8d3a: Explicit depend on ws
- 40ca953: fix: Add logging when overriding user config in edge environments
- b58a4f9: Depend on optional ws modules
- f3b3519: explicitly declare node in export map
- 71977ca: feat: Everything works!
- 2a9b401: breaking: Changed public API of both projects
- ce5f3f1: Support expording a pool instance as db
- 21f20b2: fix: Unpatch nextTick, incorporate upstream patch from Neon
- 66fb7f0: feat: Make `sql` a callable Pool instance
- 4d2f4fa: chore: Convert to monorepo, split packages
  fix: Add `bufferutils` and `utf-8-validate` as deps of `@vercel/postgres`
- fb0f276: Polyfill nextTick
- 7c542aa: chore: Just testing to see if this passes publish
- 034ded3: We have side effects
- 3372fe1: No client reuse in the edge runtme

## 0.1.0-canary.29

### Patch Changes

- 6445b6d: Make VercelClients in VercelPool

## 0.1.0-canary.28

### Patch Changes

- ce5f3f1: Support expording a pool instance as db

## 0.1.0-canary.27

### Patch Changes

- 3372fe1: No client reuse in the edge runtme

## 0.1.0-canary.26

### Patch Changes

- 2a9b401: breaking: Changed public API of both projects

## 0.1.0-canary.25

### Patch Changes

- 7c542aa: chore: Just testing to see if this passes publish

## 0.1.0-canary.24

### Patch Changes

- e1d2446: fix: Lockfile...?

## 0.1.0-canary.23

### Patch Changes

- 4d2f4fa: chore: Convert to monorepo, split packages
  fix: Add `bufferutils` and `utf-8-validate` as deps of `@vercel/postgres`

## 0.1.0-canary.22

### Patch Changes

- b58a4f9: Depend on optional ws modules

## 0.1.0-canary.21

### Patch Changes

- 71977ca: feat: Everything works!

## 0.1.0-canary.20

### Patch Changes

- 10c8d3a: Explicit depend on ws

## 0.1.0-canary.19

### Patch Changes

- 034ded3: We have side effects

## 0.1.0-canary.18

### Patch Changes

- f3b3519: explicitly declare node in export map

## 0.1.0-canary.17

### Patch Changes

- 21f20b2: fix: Unpatch nextTick, incorporate upstream patch from Neon
- fb0f276: Polyfill nextTick

## 0.1.0
