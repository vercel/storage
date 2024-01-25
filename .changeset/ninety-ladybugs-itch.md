---
"@vercel/blob": minor
"vercel-storage-integration-test-suite": patch
---

# feat(blob): add manual multipart upload methods

This exposes the three different multipart steps as functions of the SDK. Before this change every multipart upload was uncontrolled, meaning the full data was passed to the SDK and it took care of chunking and uploading.
Now it's possible to manually upload chunks and start and complete the multipart upload. All of the new function can be used both on the server and the browser. There are two different API's that can be used.

> When using manual multipart uploads **every upload part has to be of the same size** and **the callside has to take care of memory management and concurrent uploads**!

## Fully manual

Use `createMultipartPut`, `multipartPut` and `completeMultipartPut` to manage the upload.

```ts
const { key, uploadId } = await vercelBlob.createMultipartPut(
  'big-file.txt',
  { access: 'public' },
);

const part1 = await vercelBlob.multipartPut(
  fullPath,
  createReadStream(fullPath),
  { access: 'public', key, uploadId, partNumber: 1 },
);

const part2 = await vercelBlob.multipartPut(
  fullPath,
  createReadStream(fullPath),
  { access: 'public', key, uploadId, partNumber: 2 },
);

const blob = await vercelBlob.completeMultipartPut(fullPath, [part1, part2], {
  access: 'public',
  key,
  uploadId,
});
```

## Semi manual

Since there is some data that stays the same across all multipart methods you can also use the util function that are returned by `createMultipartPut`. We keep some data in the closure of `createMultipartPut` and therefor expose a simpler `put` and `complete` function.

```ts
const multiPartUpload = await vercelBlob.createMultipartPut('big-file.txt', {
  access: 'public',
});

const part1 = await multiPartUpload.put(1, createReadStream(fullPath));

const part2 = await multiPartUpload.put(2, createReadStream(fullPath));

const blob = await multiPartUpload.complete([part1, part2]);
```
