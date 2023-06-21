---
'@vercel/postgres': patch
---

Before this release, when using our default pooling client (`import { sql } from '@vercel/storage'`), and deploying on Vercel Edge Functions,
then your Edge Functions would timeout after 11 requests.

Full explanation: we set node-postgres Pool `maxUses` parameter to `1` in Edge Function, because clients can't be reused between requests in this serverless context.
This combined with how our module is made (a JavaScript proxy) triggered a specific condition where clients would never be released to the Pool.

The exact line that failed under these circumstances was: https://github.com/brianc/node-postgres/blob/735683c5cb41bcbf043c6490be4b7f38cfe3ac48/packages/pg-pool/index.js#L166

This is now fixed, thanks @cramforce.
