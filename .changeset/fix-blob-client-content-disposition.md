---
"@vercel/blob": patch
---

fix(blob): normalize contentDisposition to use original filename when addRandomSuffix is enabled

When `addRandomSuffix: true` is set for client uploads, the Vercel Blob API
returns a `contentDisposition` header that includes the random suffix in the
filename (e.g. `attachment; filename="img-abc123.jpg"`). This fix ensures the
SDK always returns the original filename in `contentDisposition` (e.g.
`attachment; filename="img.jpg"`), consistent with server-side `put()` behavior.

Fixes #903
