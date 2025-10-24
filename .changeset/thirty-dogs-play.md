---
'@vercel/edge-config': patch
---

Support Next.js v16 Cache Components even within `proxy.ts` (fka `middleware.ts`) - see [#890](https://github.com/vercel/storage/pull/890)

The `@vercel/edge-config` v1.4.1 release added support for Next.js v16 `cacheComponents`, but did not support using `@vercel/edge-config` in Next.js's `proxy.ts` (fka `middleware.ts`) when the `cacheComponents` flag was enabled in `next.config.ts`. This releases fixes this issue so `@vercel/edge-config` can be used in any server side context in Next.js again.
