---
'@vercel/blob': minor
---

Add `ttlDays` option to `put`, `putImage`, `putFromUrl`, `copy`, `rename`, `createMultipartUpload`, client tokens and presigned URLs. Blobs uploaded with a TTL are deleted automatically after that many days; `head()` returns the scheduled `expiresAt`. Each write that sets a TTL counts as one additional Advanced Operation.
