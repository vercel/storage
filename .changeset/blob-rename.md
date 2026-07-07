---
'@vercel/blob': minor
---

Add `rename(fromUrlOrPathname, toPathname, options)` to move a blob to another pathname. The blob is copied to the new pathname and the source is deleted afterwards; if the copy fails the source is left untouched. By default renaming onto an existing blob throws — pass `allowOverwrite: true` to replace it, or `addRandomSuffix: true` to generate a unique destination. Requires a read-write token (client tokens are not supported).
