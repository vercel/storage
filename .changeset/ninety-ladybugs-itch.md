---
"@vercel/blob": minor
"vercel-storage-integration-test-suite": patch
---

# feat(blob): add advanced multipart upload methods

This exposes the three different multipart steps as functions of the SDK. Before this change every multipart upload was uncontrolled, meaning the full data was passed to the SDK and the SDK took care of chunking and uploading.
Now it's possible to manually upload chunks and start and complete the multipart upload. All of the new functions can be used both on the server and the browser. There are two different API's that can be used.


## Individual methods

Use `createMultipartUpload`, `multipartUpload` and `completeMultipartUpload` to manage the upload.

```ts
const { key, uploadId } = await vercelBlob.createMultipartUpload(
  'big-file.txt',
  { access: 'public' },
);

const part1 = await vercelBlob.multipartUpload(
  fullPath,
  createReadStream(fullPath),
  { access: 'public', key, uploadId, partNumber: 1 },
);

const part2 = await vercelBlob.multipartUpload(
  fullPath,
  createReadStream(fullPath),
  { access: 'public', key, uploadId, partNumber: 2 },
);

const blob = await vercelBlob.completeMultipartUpload(fullPath, [part1, part2], {
  access: 'public',
  key,
  uploadId,
});
```

## Using an Uploader

Since there is some data that stays the same across all multipart methods you can also use the `createMultipartUploader`. We keep some data in the closure of `createMultipartUploader` and therefor expose a simpler `put` and `complete` function.

```ts
const uploader = await vercelBlob.createMultipartUploader('big-file.txt', {
  access: 'public',
});

const part1 = await multiPartUpload.uploadPart(1, createReadStream(fullPath));

const part2 = await multiPartUpload.uploadPart(2, createReadStream(fullPath));

const blob = await multiPartUpload.complete([part1, part2]);
```
