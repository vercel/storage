---
"@vercel/blob": minor
---

Add ETag support for conditional writes (optimistic concurrency control)

- Return `etag` in all blob responses (put, copy, head, list, multipart)
- Accept `ifMatch` option in put/copy/createMultipartUpload for conditional writes
- Add `BlobPreconditionFailedError` for ETag mismatch (HTTP 412)
