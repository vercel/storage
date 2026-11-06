---
'@vercel/blob': minor
---

`put`, `putImage`, `copy`, `rename` and `completeMultipartUpload` now return `expiresAt` (a `Date`) for blobs written with `ttlDays`, so you no longer need a follow-up `head()` to learn when a blob will be deleted.
