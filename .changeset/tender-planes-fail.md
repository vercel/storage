---
"@vercel/blob": patch
---

fix(blob): Enforce content-type on fetch requests during token generation

Before this change, we would not send the content-type header on fetch requests sent to your server during client uploads. We consider this a bugfix as it should have been sent before.

⚠️ If you're using Next.js pages API routes (or any smart server), you need to remove `JSON.parse(request.body)` at the `handleUpload` step, as the body will be JSON by default now.
