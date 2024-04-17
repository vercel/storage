---
"@vercel/blob": minor
"vercel-storage-integration-test-suite": patch
---

# Add abortSignal

Adds `abortSignal` option to all methods. This allows users to cancel requests using an AbortController and passing its signal to the operation.

Here's how to use it:

```ts
const abortController = new AbortController();

vercelBlob.put('canceled.txt', 'test', {
  access: 'public',
  abortSignal: abortController.signal,
}).then(blob => {
  console.log('Blob created:', blob);
});

setTimeout(function() {
  // Abort the upload
  abortController.abort();
}, 100);
```
