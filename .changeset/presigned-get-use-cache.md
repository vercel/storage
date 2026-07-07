---
'@vercel/blob': patch
---

Add a `useCache` option to `presignUrl()` for `get` operations. When `useCache: false`, the presigned URL includes a `cache=0` query param so fetches bypass the CDN cache and read the latest content directly from origin storage. Like `get()`, the bypass only applies to private blobs. The param is not part of the signed payload, so holders of a presigned URL can also add or remove it manually.
