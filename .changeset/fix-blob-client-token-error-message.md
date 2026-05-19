---
"@vercel/blob": patch
---

fix(blob): include HTTP status in error when client token retrieval fails

When `upload()` fails to retrieve a client token from `handleUploadUrl`
(e.g. the route returns 401, 403, or 500), the error message now includes
the HTTP status code and status text to help with debugging.

Closes #488
