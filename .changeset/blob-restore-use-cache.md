---
'@vercel/blob': minor
---

Restore the `useCache` option on `get()`. Passing `useCache: false` bypasses the CDN cache and serves the blob directly from origin storage (via the `cache=0` query parameter), guaranteeing the latest content at the cost of slower reads. Defaults to `true`.
