---
'@vercel/blob': patch
---

Make `ifMatch` imply `allowOverwrite: true` on `put()`. Previously, using `ifMatch` without explicitly setting `allowOverwrite: true` would cause the server to send conflicting conditional headers to S3, resulting in 500 errors. Now the SDK implicitly enables `allowOverwrite` when `ifMatch` is set, and throws a clear error if `allowOverwrite: false` is explicitly combined with `ifMatch`.
