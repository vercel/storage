# @vercel/kv

## 2.0.0

### Major Changes

- d02e08a: Enable auto pipelining by default.
  We're making this a major release for safety, but we believe
  most applications can upgrade from 1.x to 2.x without any changes.
  Auto pipelining should work by default and improve performance.

  _BREAKING_ CHANGE: Auto pipelining is on by default now. See
  https://upstash.com/docs/oss/sdks/ts/redis/pipelining/auto-pipeline. This
  brings performance benefits to any code making multiple redis commands
  simultaneously.

  If you detect bugs because of this, please open them at
  https://github.com/vercel/storage/issues.

  You can disable this new behavior with:

  ```js
  import { createClient } from '@vercel/kv';

  const kv = createClient({
    url: ..,
    token: ..,
    enableAutoPipelining: false
  });
  ```

## 1.0.1

### Patch Changes

- 44f84bd: Upgrade to latest upstash-redis: https://github.com/upstash/upstash-redis/releases

## 1.0.0

### Major Changes

- d85bb76: feat(kv): Switch to `default` for fetch `cache` option

  BREAKING CHANGE: When using Next.js and vercel/kv, you may have kv requests and/or Next.js resources using kv being cached when you don't want them to.

  If that's the case, then opt-out of caching with
  https://nextjs.org/docs/app/api-reference/functions/unstable_noStore.

  On the contrary, if you want to enforce caching of resources you can use https://nextjs.org/docs/app/api-reference/functions/unstable_cache.

## 0.2.4

### Patch Changes

- c7b111c: fix(kv): upgrade upstash package to latest 1.24.3

## 0.2.3

### Patch Changes

- d90e973: Removed `"types"` field from package.json to support `"moduleResolution": "Node16"`

## 0.2.2

### Patch Changes

- f545e1c: Upgrade @upstash/redis to the latest version
  Stop minifying and add sourcemaps for better debugging

## 0.2.1

### Patch Changes

- 1d97019: Update readme

## 0.2.0

### Minor Changes

- 30e3f04: move default export to named kv export

## 0.1.2

### Patch Changes

- 88aa25e: avoid process.version warning in edge runtime
- c4a8aa5: feat: Docs section for Vite environment config
- 8b843c5: debug-issue-107

## 0.1.2-canary.0

### Patch Changes

- 8b843c5: debug-issue-107

## 0.1.1

### Patch Changes

- 1ade1f0: chore: Update package.json and licenses

## 0.1.0

### Minor Changes

- 736e23c: update constructor and doc

### Patch Changes

- 3198158: Introduce iterator scanning methods
- 0204c45: Correct type for kv export
- 33479d7: fix package name in error message

## 0.1.0-canary.4

### Patch Changes

- 0204c45: Correct type for kv export

## 0.1.0-canary.3

### Minor Changes

- 736e23c: update constructor and doc

### Patch Changes

- 3198158: Introduce iterator scanning methods
- 33479d7: fix package name in error message
