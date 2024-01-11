---
"@vercel/blob": minor
"vercel-storage-integration-test-suite": patch
---

feat(blob): Add multipart option to reliably upload medium and large files

It turns out, uploading large files using Vercel Blob has been a struggle for users.
Before this change, file uploads were limited to around 200MB for technical reasons.
Before this change, even uploading a file of 100MB could fail for various reasons (network being one of them).

To solve this for good, we're introducting a new option to `put` and `upload` calls: `multipart: true`. This new option will make sure your file is uploaded parts by parts to Vercel Blob, and when some parts are failing, we will retry them. This option is available for server and client uploads.

Usage:
```ts
const blob = await put('file.png', file, {
  access: 'public',
  multipart: true // `false` by default
});

// and:
const blob = await upload('file.png', file, {
  access: 'public',
  handleUploadUrl: '/api/upload',
  multipart: true
});
```

If your `file` is a Node.js stream or a [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) then we will gradually read and upload it without blowing out your server or browser memory.

More examples:

```ts
import { createReadStream } from 'node:fs';

const blob = await vercelBlob.put(
  'elon.mp4',
  // this works 👍, it will gradually read the file from the system and upload it
  createReadStream('/users/Elon/me.mp4'),
  { access: 'public', multipart: true }
);
```

```ts
const blob = await vercelBlob.put(
  'example_big.mp4',
  // this works too 👍, it will gradually read the file from internet and upload it
  await fetch(
    'https://example-files.online-convert.com/video/mp4/example_big.mp4',
  ),
  { access: 'public', multipart: true },
);
```
