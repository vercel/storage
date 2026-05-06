---
"@vercel/blob": patch
---

Add `delete` to `DelegationOperation` so `issueSignedToken` and `presignUrl` can mint short-lived presigned `DELETE` URLs against `*.blob.vercel-storage.com` object URLs.
