---
"@vercel/blob": patch
---

fix(blob): Enforce content-type on fetch requests during token generation

Before this change, we would not send the content-type header on fetch requests sent to your server during client uploads. We consider this a bugfix as it should have been sent before.

⚠️ If you upgrade to this version, and you're using any smart request body parser (like Next.js Pages API routes) then: You need to remove any `JSON.parse(request.body)` at the `handleUpload` step, as the body will be JSON by default now. This is valid for the `onBeforeGenerateToken` and `onUploadCompleted` steps.
