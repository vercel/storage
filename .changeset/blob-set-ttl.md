---
'@vercel/blob': minor
---

Add `setTtl(urlOrPathname, { ttlDays })` to change or clear a blob's TTL in place. Pass `ttlDays: null` to remove it. S3 counts the TTL from the blob's upload date, not from this call.
