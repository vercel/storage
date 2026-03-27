---
'@vercel/blob': patch
---

Apply `ifMatch`/`allowOverwrite` validation to `handleUpload` and `generateClientTokenFromReadWriteToken`. When `ifMatch` is set via `onBeforeGenerateToken` or direct token generation, `allowOverwrite` is now implicitly enabled. Explicitly passing `allowOverwrite: false` with `ifMatch` throws a clear error.
