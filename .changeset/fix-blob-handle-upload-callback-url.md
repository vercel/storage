---
"@vercel/blob": patch
---

fix(blob): infer handleUpload callback urls from node request headers

When `handleUpload()` is used with `onUploadCompleted()` and no explicit
`callbackUrl` is returned from `onBeforeGenerateToken()`, the SDK now falls back
to Node request headers such as `x-forwarded-host`, `x-forwarded-proto`, and
`host` to infer the callback URL.
