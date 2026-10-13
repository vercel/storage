---
'@vercel/blob': patch
---

Send blob API version 13, where the server reads keys containing `.` or `..` path segments exactly as they were written instead of resolving them away. Fixes `head`, `copy`, `rename`, `del` and `list` on blobs whose pathname has a dot segment.
