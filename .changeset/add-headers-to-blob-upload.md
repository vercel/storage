---
"@vercel/blob": minor
---

feat(blob): Add support for custom headers in client upload method

This change adds the ability to pass custom headers to the `upload` method in the client, which will be forwarded to the server endpoint specified by `handleUploadUrl`. This is particularly useful for sending authorization headers and solves issues like [#796](https://github.com/vercel/storage/issues/796) and [#420](https://github.com/vercel/storage/issues/420).