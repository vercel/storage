# vercel-storage-integration-test-suite

## 0.2.19

### Patch Changes

- Updated dependencies [8098803]
- Updated dependencies [aaec8c5]
- Updated dependencies [8d7e8b9]
  - @vercel/blob@0.24.0
  - @vercel/edge-config@1.3.0

## 0.2.18

### Patch Changes

- Updated dependencies [a2a4757]
  - @vercel/postgres-kysely@0.10.0
  - @vercel/postgres@0.10.0

## 0.2.17

### Patch Changes

- Updated dependencies [3057a36]
  - @vercel/edge-config@1.2.1

## 0.2.16

### Patch Changes

- Updated dependencies [30401f4]
  - @vercel/blob@0.23.4

## 0.2.15

### Patch Changes

- Updated dependencies [30fe8d0]
  - @vercel/postgres@0.9.0
  - @vercel/postgres-kysely@0.9.0

## 0.2.14

### Patch Changes

- Updated dependencies [6a592b5]
- Updated dependencies [6a592b5]
  - @vercel/edge-config@1.2.0

## 0.2.13

### Patch Changes

- Updated dependencies [585a753]
- Updated dependencies [c0bdd40]
- Updated dependencies [c5d10d7]
  - @vercel/edge-config@1.1.1
  - @vercel/blob@0.23.3

## 0.2.12

### Patch Changes

- Updated dependencies [e63f125]
  - @vercel/blob@0.23.2

## 0.2.11

### Patch Changes

- 1cad24c: fix(blob): export all user facing errors
- Updated dependencies [1cad24c]
  - @vercel/blob@0.23.1

## 0.2.10

### Patch Changes

- 261319e: # Add abortSignal

  Adds `abortSignal` option to all methods. This allows users to cancel requests using an AbortController and passing its signal to the operation.

  Here's how to use it:

  ```ts
  const abortController = new AbortController();

  vercelBlob
    .put('canceled.txt', 'test', {
      access: 'public',
      abortSignal: abortController.signal,
    })
    .then((blob) => {
      console.log('Blob created:', blob);
    });

  setTimeout(function () {
    // Abort the upload
    abortController.abort();
  }, 100);
  ```

- Updated dependencies [261319e]
  - @vercel/blob@0.23.0

## 0.2.9

### Patch Changes

- Updated dependencies [5b9b53d]
  - @vercel/blob@0.22.3

## 0.2.8

### Patch Changes

- Updated dependencies [13988ed]
  - @vercel/blob@0.22.2

## 0.2.7

### Patch Changes

- Updated dependencies [e36fa70]
  - @vercel/postgres@0.8.0
  - @vercel/postgres-kysely@0.8.0

## 0.2.6

### Patch Changes

- Updated dependencies [5fb6969]
  - @vercel/edge-config@1.1.0

## 0.2.5

### Patch Changes

- Updated dependencies [69a5c52]
  - @vercel/blob@0.22.1

## 0.2.4

### Patch Changes

- Updated dependencies [78d5814]
  - @vercel/edge-config@1.0.2

## 0.2.3

### Patch Changes

- Updated dependencies [4e7e216]
  - @vercel/edge-config@1.0.1

## 0.2.2

### Patch Changes

- Updated dependencies [fcdc55e]
- Updated dependencies [52c2fe2]
  - @vercel/edge-config@1.0.0
  - @vercel/blob@0.22.0

## 0.2.1

### Patch Changes

- 8e278f2: # feat(blob): add advanced multipart upload methods

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

  const part1 = await vercelBlob.uploadPart(fullPath, 'first part', {
    access: 'public',
    key,
    uploadId,
    partNumber: 1,
  });

  const part2 = await vercelBlob.uploadPart(fullPath, 'second part', {
    access: 'public',
    key,
    uploadId,
    partNumber: 2,
  });

  const blob = await vercelBlob.completeMultipartUpload(
    fullPath,
    [part1, part2],
    {
      access: 'public',
      key,
      uploadId,
    },
  );
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

- Updated dependencies [8e278f2]
- Updated dependencies [2ecc0e2]
  - @vercel/blob@0.21.0

## 0.2.0

### Minor Changes

- 5d71dda: # feat(blob): add `downloadUrl` and `getDownloadUrl`

  Adds a new blob property called `downloadUrl`. This URL will have the `content-disposition` set to `attachment` meaning it will force browsers to start a download instead of showing a preview. This URL can be used to implement download links. In addition to this new field the sdk is also exposing a new util function called `getDownloadUrl` which can also be used to derive a download URL from a blob URL.

### Patch Changes

- Updated dependencies [5d71dda]
  - @vercel/blob@0.20.0

## 0.1.43

### Patch Changes

- Updated dependencies [5d84a4a]
  - @vercel/postgres-kysely@0.7.2
  - @vercel/postgres@0.7.2

## 0.1.42

### Patch Changes

- Updated dependencies [abfdf65]
  - @vercel/postgres-kysely@0.7.1
  - @vercel/postgres@0.7.1

## 0.1.41

### Patch Changes

- Updated dependencies [d44bd3b]
  - @vercel/blob@0.19.0

## 0.1.40

### Patch Changes

- Updated dependencies [f70264e]
  - @vercel/postgres-kysely@0.7.0

## 0.1.39

### Patch Changes

- Updated dependencies [dc7ba0e]
  - @vercel/blob@0.18.0

## 0.1.38

### Patch Changes

- Updated dependencies [d4c06b0]
  - @vercel/blob@0.17.1

## 0.1.37

### Patch Changes

- fd1781f: feat(blob): allow folder creation

  This allows the creation of empty folders in the blob store. Before this change the SDK would always require a body, which is prohibited by the API.
  Now the the SDK validates if the operation is a folder creation by checking if the pathname ends with a trailling slash.

  ```ts
  const blob = await vercelBlob.put('folder/', {
    access: 'public',
    addRandomSuffix: false,
  });
  ```

- 898c14a: feat(blob): Add multipart option to reliably upload medium and large files

  It turns out, uploading large files using Vercel Blob has been a struggle for users.
  Before this change, file uploads were limited to around 200MB for technical reasons.
  Before this change, even uploading a file of 100MB could fail for various reasons (network being one of them).

  To solve this for good, we're introducting a new option to `put` and `upload` calls: `multipart: true`. This new option will make sure your file is uploaded parts by parts to Vercel Blob, and when some parts are failing, we will retry them. This option is available for server and client uploads.

  Usage:

  ```ts
  const blob = await put('file.png', file, {
    access: 'public',
    multipart: true, // `false` by default
  });

  // and:
  const blob = await upload('file.png', file, {
    access: 'public',
    handleUploadUrl: '/api/upload',
    multipart: true,
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
    { access: 'public', multipart: true },
  );
  ```

  ```ts
  const response = await fetch(
    'https://example-files.online-convert.com/video/mp4/example_big.mp4',
  );

  const blob = await vercelBlob.put(
    'example_big.mp4',
    // this works too 👍, it will gradually read the file from internet and upload it
    response.body,
    { access: 'public', multipart: true },
  );
  ```

- Updated dependencies [fd1781f]
- Updated dependencies [898c14a]
  - @vercel/blob@0.17.0

## 0.1.36

### Patch Changes

- Updated dependencies [ae0ba27]
- Updated dependencies [5624237]
  - @vercel/blob@0.16.1

## 0.1.35

### Patch Changes

- Updated dependencies [26a2acb]
  - @vercel/blob@0.16.0

## 0.1.34

### Patch Changes

- Updated dependencies [f9c4061]
  - @vercel/blob@0.15.1

## 0.1.33

### Patch Changes

- Updated dependencies [d57df99]
  - @vercel/blob@0.15.0

## 0.1.32

### Patch Changes

- Updated dependencies [a247635]
  - @vercel/postgres-kysely@0.6.0

## 0.1.31

### Patch Changes

- Updated dependencies [4e8161a]
  - @vercel/postgres-kysely@0.5.1
  - @vercel/postgres@0.5.1

## 0.1.30

### Patch Changes

- Updated dependencies [0e9fc17]
- Updated dependencies [41c4483]
  - @vercel/blob@0.14.1

## 0.1.29

### Patch Changes

- Updated dependencies [9a6c44f]
  - @vercel/blob@0.14.0

## 0.1.28

### Patch Changes

- Updated dependencies [15de089]
  - @vercel/blob@0.13.1

## 0.1.27

### Patch Changes

- Updated dependencies [3cf97b1]
  - @vercel/blob@0.13.0

## 0.1.26

### Patch Changes

- Updated dependencies [4701d58]
  - @vercel/postgres@0.5.0
  - @vercel/postgres-kysely@0.5.0

## 0.1.25

### Patch Changes

- Updated dependencies [f033492]
  - @vercel/blob@0.12.5

## 0.1.24

### Patch Changes

- Updated dependencies [3105f2b]
- Updated dependencies [d90e973]
  - @vercel/edge-config@0.4.1
  - @vercel/postgres-kysely@0.4.2
  - @vercel/postgres@0.4.2
  - @vercel/blob@0.12.4

## 0.1.23

### Patch Changes

- Updated dependencies [c0fe4e7]
  - @vercel/blob@0.12.3

## 0.1.22

### Patch Changes

- Updated dependencies [15f7eef]
  - @vercel/blob@0.12.2

## 0.1.21

### Patch Changes

- Updated dependencies [ae93246]
  - @vercel/blob@0.12.1

## 0.1.20

### Patch Changes

- Updated dependencies [e01f1ef]
  - @vercel/edge-config@0.4.0

## 0.1.19

### Patch Changes

- Updated dependencies [8251462]
  - @vercel/blob@0.12.0

## 0.1.18

### Patch Changes

- Updated dependencies [cedd4b9]
- Updated dependencies [b409aad]
  - @vercel/edge-config@0.3.0
  - @vercel/blob@0.11.0

## 0.1.17

### Patch Changes

- Updated dependencies [6104c9f]
  - @vercel/postgres@0.4.1
  - @vercel/postgres-kysely@0.4.1

## 0.1.16

### Patch Changes

- Updated dependencies [e273673]
  - @vercel/blob@0.10.0

## 0.1.15

### Patch Changes

- Updated dependencies [978a817]
  - @vercel/blob@0.9.3

## 0.1.14

### Patch Changes

- Updated dependencies [f545e1c]
  - @vercel/postgres@0.4.0
  - @vercel/postgres-kysely@0.4.0

## 0.1.13

### Patch Changes

- Updated dependencies [52ce540]
  - @vercel/postgres@0.3.2
  - @vercel/postgres-kysely@0.3.2

## 0.1.12

### Patch Changes

- Updated dependencies [ce4b585]
  - @vercel/blob@0.9.2

## 0.1.11

### Patch Changes

- Updated dependencies [08caff4]
  - @vercel/blob@0.9.1

## 0.1.10

### Patch Changes

- Updated dependencies [28ba58d]
  - @vercel/blob@0.9.0

## 0.1.9

### Patch Changes

- Updated dependencies [cec1d6b]
  - @vercel/postgres@0.3.1
  - @vercel/postgres-kysely@0.3.1

## 0.1.8

### Patch Changes

- Updated dependencies [97a3d06]
  - @vercel/edge-config@0.2.1

## 0.1.7

### Patch Changes

- Updated dependencies [7944205]
  - @vercel/edge-config@0.2.0

## 0.1.6

### Patch Changes

- Updated dependencies [d224a2a]
- Updated dependencies [490a976]
- Updated dependencies [282b5ee]
  - @vercel/edge-config@0.1.11

## 0.1.6-canary.1

### Patch Changes

- Updated dependencies [282b5ee]
  - @vercel/edge-config@0.1.11-canary.1

## 0.1.6-canary.0

### Patch Changes

- Updated dependencies [490a976]
  - @vercel/edge-config@0.1.11-canary.0

## 0.1.5

### Patch Changes

- Updated dependencies [e976847]
  - @vercel/blob@0.8.3

## 0.1.4

### Patch Changes

- Updated dependencies [04e175d]
  - @vercel/blob@0.8.2

## 0.1.3

### Patch Changes

- Updated dependencies [34defd9]
  - @vercel/postgres@0.3.0
  - @vercel/postgres-kysely@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [6b8b7a9]
  - @vercel/postgres@0.2.1
  - @vercel/postgres-kysely@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [8b51d48]
- Updated dependencies [18b69a5]
- Updated dependencies [c4a8aa5]
  - @vercel/postgres@0.2.0
  - @vercel/postgres-kysely@0.2.0
