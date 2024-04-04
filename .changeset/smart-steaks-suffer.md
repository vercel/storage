---
"@vercel/blob": patch
---

BREAKING CHANGE: The `contentType` field of the PutBlobResult is now optional which might break TS builds. This aligns the SDK typings with the actual Response of the Blob API.
