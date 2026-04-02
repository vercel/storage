---
"@vercel/blob": patch
---

fix(blob): respect pathname returned by onBeforeGenerateToken in handleUpload

When using `handleUpload()`, the pathname returned from
`onBeforeGenerateToken()` is now used when generating the client token.
Previously, the SDK always used the original client-supplied pathname even when
the server returned an overridden pathname.
