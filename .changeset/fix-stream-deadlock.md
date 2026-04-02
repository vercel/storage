---
"@vercel/blob": patch
---

Fix multipart upload hanging forever on empty streams, and fix `createChunkTransformStream` bypassing backpressure by removing incorrect `queueMicrotask` wrapping.
