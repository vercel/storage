---
"@vercel/blob": minor
---

feat(blob): allow inline content disposition for certain blobs

Once you use this new version, then most common medias won't be automatically
downloading but rather will display the content inline.

Already uploaded files will not change their behavior.
You can reupload them if you want to change their behavior.

Fixes #509
