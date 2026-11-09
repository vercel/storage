---
'@vercel/blob': minor
---

Add `setTtl(urlOrPathname, { ttlDays })` to change or clear a blob's TTL in place. Pass `ttlDays: null` to remove it. Pass an array of up to 1,000 urls to update them in one request; a blob that couldn't be updated comes back as an `error` entry (`not_found` when it doesn't exist) instead of failing the batch. S3 counts the TTL from the blob's upload date, not from this call.
