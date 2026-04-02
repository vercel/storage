---
"@vercel/blob": patch
---

Enforce `maximumSizeInBytes` client-side for multipart uploads. Bodies with a known size (Blob, File, Buffer) are now checked before the upload starts, avoiding wasted API calls.
