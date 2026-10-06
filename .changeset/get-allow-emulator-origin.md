---
'@vercel/blob': patch
---

Allow `get()` to fetch blob URLs from a `VERCEL_BLOB_API_URL` origin. `get()` only accepted URLs on `*.blob.vercel-storage.com`, which blocked local emulators like [`emulate`](https://npmx.dev/package/emulate), since they serve blob content from their own host. When `VERCEL_BLOB_API_URL` (or `NEXT_PUBLIC_VERCEL_BLOB_API_URL`) is set, URLs on that same origin are now accepted as well. With no override set the behavior is unchanged, so arbitrary hosts are still rejected in production.
