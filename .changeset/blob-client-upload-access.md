---
'@vercel/blob': minor
---

Allow client uploads to set `access`. `handleUpload`'s `onBeforeGenerateToken` callback can now return `access: 'public' | 'private'`, and it is baked into the signed client token — bringing client uploads to parity with the server-side `put({ access })` API. When omitted, behavior is unchanged (public). Fixes #1079.
