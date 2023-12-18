---
"@vercel/blob": minor
"vercel-storage-integration-test-suite": patch
---

feat(blob): Add multipart option for big uploads

You can use the `multipart: true` option to upload big files on Vercel Blob (up to 5TB theoretically).
Before this change, file uploads were limited to around 200MB for technical reasons.

Usage:
```ts
const blob = await put('file.png', file, {
  access: 'public',
  multipart: true
});

// and:
const blob = await upload('file.png', file, {
  access: 'public',
  handleUploadUrl: '/api/upload',
  multipart: true
});
```
