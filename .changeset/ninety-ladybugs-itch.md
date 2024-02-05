---
"@vercel/blob": minor
"vercel-storage-integration-test-suite": patch
---

# feat(blob): add advanced multipart upload methods

This exposes the three different multipart steps as functions of the SDK. Before this change every multipart upload was uncontrolled, meaning the full data was passed to the SDK and the SDK took care of chunking and uploading.

Now it's possible to manually upload chunks and start and complete the multipart upload. All of the new functions can be used both on the server and the browser. There are two different API's that can be used.

All parts uploaded must be at least 5MB in size, except for the last part. The last part can be smaller than 5MB. If you have a single part, it can be any size. All parts must be the same size, except for the last part.

## Individual methods

Use `createMultipartUpload`, `uploadPart` and `completeMultipartUpload` to manage the upload.

```ts
const { key, uploadId } = await vercelBlob.createMultipartUpload(
  'big-file.txt',
  { access: 'public' },
);

const part1 = await vercelBlob.uploadPart(
  fullPath,
  'first part',
  { access: 'public', key, uploadId, partNumber: 1 },
);

const part2 = await vercelBlob.uploadPart(
  fullPath,
  'second part',
  { access: 'public', key, uploadId, partNumber: 2 },
);

const blob = await vercelBlob.completeMultipartUpload(fullPath, [part1, part2], {
  access: 'public',
  key,
  uploadId,
});
```

## Multipart uploader

For multipart methods, since some of the data remains consistent (uploadId, key), you can make use of the `createMultipartUploader`. This function stores certain data internally, making it possible to offer convinient `put` and `complete` functions.

```ts
const uploader = await vercelBlob.createMultipartUploader('big-file.txt', {
  access: 'public',
});

const part1 = await uploader.uploadPart(1, createReadStream(fullPath));

const part2 = await uploader.uploadPart(2, createReadStream(fullPath));

const blob = await uploader.complete([part1, part2]);
```
