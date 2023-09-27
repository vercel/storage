---
'@vercel/blob': minor
---

This new version brings consistent and detailed errors about request failures (store does not exist, blob does not exist, store is suspended...).
BREAKING CHANGE: head() will now throw instead of returning null when the blob does not exist.
