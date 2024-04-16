---
"@vercel/blob": minor
"vercel-storage-integration-test-suite": patch
---

# Add abortSignal

Adds `abortSignal` option to all methods. This allows users to cancel requests using an AbortController and passing its signal to the operation.

Here's how to use it:

```ts
// don't await here
const promise = vercelBlob.put('canceled.txt', 'test', {
  access: 'public',
  abortSignal: abortController.signal,
});

abortController.abort();
```
