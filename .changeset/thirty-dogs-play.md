---
'@vercel/edge-config': patch
---

Support Next.js v16 Cache Components even within `proxy.ts` (fka `middleware.ts`) - see [#890](https://github.com/vercel/storage/pull/890)

Suppress errors thrown by cacheLife for contexts where the next-js condition is set but "use cache" functions are not turned into Cache Functions
