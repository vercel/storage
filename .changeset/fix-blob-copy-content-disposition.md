---
'@vercel/blob': patch
---

fix(blob): normalize contentDisposition filename in copy() when addRandomSuffix is enabled

When `copy()` is called with `addRandomSuffix: true`, the Vercel Blob API
returns a `contentDisposition` header containing the suffixed filename
(e.g. `attachment; filename="report-abc123.pdf"`). The SDK now normalizes
this to always use the original `toPathname` filename, matching the
behaviour already enforced for `put()`.
