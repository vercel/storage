---
'@vercel/blob': minor
'vercel-storage-integration-test-suite': minor
---

Add onUploadProgress feature to put/upload

You can now track the upload progress in Node.js and all major browsers when
using put/upload in multipart, non-multipart and client upload modes. Basically
anywhere in our API you can upload a file, then you can follow the upload
progress.

Here's a basic usage example:

```
const blob = await put('big-file.pdf', file, {
  access: 'public',
  onUploadProgress(event) {
    console.log(event.loaded, event.total, event.percentage);
  }
});
```

Fixes #543
Fixes #642
