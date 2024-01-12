---
"@vercel/blob": patch
"vercel-storage-integration-test-suite": patch
---

feat(blob): allow folder creation

This allows the creation of empty folders in the blob store. Before this change the SDK would always require a body, which is prohibited by the API. 
Now the the SDK validates if the operation is a folder creation by checking if the pathname ends with a trailling slash.

```ts
const blob = await vercelBlob.put('folder/', {
  access: 'public',
  addRandomSuffix: false,
});
```
