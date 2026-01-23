# @vercel/blob

## 2.0.1

### Patch Changes

- e2de71a: Upgrade undici to fix security issue warning

## 2.0.0

### Major Changes

- 0b8ead9: **BREAKING CHANGE:**

  To continue receiving `onUploadCompleted` callback once a file is uploaded with Client Uploads when **not hosted on Vercel**, you need to provide the `callbackUrl` at the `onBeforeGenerateToken` step when using `handleUpload`.

  **When hosted on Vercel:**
  No code changes required. The `callbackUrl` is inferred from [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables):

  - In preview environment: `VERCEL_BRANCH_URL` when available, otherwise `VERCEL_URL`
  - In production environment: `VERCEL_PROJECT_PRODUCTION_URL`

  If you're not hosted on Vercel or you're not using Vercel system environment variables, your will need to provide the `callbackUrl`:

  **Before:**

  ```ts
  await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      /* options */
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      /* code */
    },
  });
  ```

  **After:**

  ```ts
  await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      return { callbackUrl: "https://example.com" }; // the path to call will be automatically computed
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      /* code */
    },
  });
  ```

  **For local development:**
  Set the `VERCEL_BLOB_CALLBACK_URL` environment variable to your tunnel URL:

  ```bash
  VERCEL_BLOB_CALLBACK_URL=https://abc123.ngrok-free.app
  ```

  See the updated documentation at https://vercel.com/docs/vercel-blob/client-upload to know more.

  **Details:**

  Before this commit, during Client Uploads, we would infer the `callbackUrl` at the client side level (browser) based on `location.href` (for convenience).
  This is wrong and allows browsers to redirect the onUploadCompleted callback to a different website.

  While not a security risk, because the blob urls are already public and the browser knows them, it still pose a risk of database drift if you're relying on onUploadCompleted callback to update any system on your side.

## 1.1.1

### Patch Changes

- f65d3c9: copy, head and del can receive a blob url or pathname, until now it was not very clear.

## 1.1.0

### Minor Changes

- 2b4acc3: feat(blob): Add support for custom headers in client upload method

  This change adds the ability to pass custom headers to the `upload` method in the client, which will be forwarded to the server endpoint specified by `handleUploadUrl`. This is particularly useful for sending authorization headers and solves issues like [#796](https://github.com/vercel/storage/issues/796) and [#420](https://github.com/vercel/storage/issues/420).

## 1.0.2

### Patch Changes

- d3627fa: Update Vercel Blob API endpoint to a more efficient one

## 1.0.1

### Patch Changes

- af5f54b: Add correct documentation to all exported methods

## 1.0.0

### Major Changes

- 00dfe23: Vercel Blob is now GA! To celebrate this we're releasing the `1.0.0` version of the Vercel Blob SDK which includes multiple changes and improvements.

  Changes:

  - `addRandomSuffix` is now false by default
  - Blobs are cached for one month, configurable and with a lower limit of 1 min. Which means you cannot configure the blob cache to be less than 1 minute.
  - Random suffixes are now also added to the `pathname` of blob responses and `content-disposition` header.
  - Overwriting blobs now requires to use `allowOverwrite: true`. Example:

  ```js
  await put("file.png", file, { access: "public" });

  await put("file.png", file, { access: "public" }); // This will throw

  put("file.png", file, { access: "public", allowOverwrite: true }); // This will work
  ```

  How to upgrade:

  - If you're using random suffixes by default, then add `addRandomSuffix: true` to `put` and `onBeforeGenerateToken` options.
  - If you're overwriting blobs, then add `allowOverwrite: true` to `put` and `onBeforeGenerateToken` options.
  - If you're using a cache-control of less than one minute, we recommend using a Vercel Function instead of a Blob. As Vercel Blob is primarily designed for caching content for a longer time.
  - If you're displaying the `pathname` field of Blob responses in a UI, and using random suffixes, make sure you adpat the UI to show the longer `pathname`.

## 0.27.3

### Patch Changes

- f88d80b: Fix documentation links in README and types, no functional changes

## 0.27.2

### Patch Changes

- 54ce5f8: Allow all special characters to be used as pathname.
  You can now use all the characters you want in pathname even the ones that have
  special meaning in urls like `%!'()@{}[]#` and it will work as expected.

## 0.27.1

### Patch Changes

- 0c98feb: fix(blob): allow client uploads in web workers

  Before this change, we had guards so client uploads could only be used in
  browser environments, this prevented customers to use Vercel Blob in Web
  Workers, sometimes React Native or in general anywhere window is not really what
  we think it is.

## 0.27.0

### Minor Changes

- 7872e61: contentType default is now 'application/octet-stream' instead of `undefined`

## 0.26.0

### Minor Changes

- c3afec3: Add onUploadProgress feature to put/upload

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

## 0.25.1

### Patch Changes

- d58f9de: fix(blob): provide custom errors for expired client tokens and pathname mismatch

## 0.25.0

### Minor Changes

- 61b5939: BREAKING CHANGE, we're no more accepting non-encoded versions of ?, # and // in pathnames. If you want to use such characters in your pathnames then you will need to encode them.

## 0.24.1

### Patch Changes

- 37d84ef: Throw specific error (BlobContentTypeNotAllowed) when file type doesn't match
- da87e89: Fix bad detection of Request being a plain object

## 0.24.0

### Minor Changes

- 8098803: Add createFolder method. Warning, if you were using the standard put() method to created fodlers, this will now fail and you must move to createFolder() instead.

### Patch Changes

- 8d7e8b9: Limit pathname length to 950 to respect internal limitations and provide better early DX.

## 0.23.4

### Patch Changes

- 30401f4: fix(blob): Throw when trying to upload a plain JS object

## 0.23.3

### Patch Changes

- c0bdd40: fix(blob): also retry internal_server_error
- c5d10d7: chore(blob): add observability headers

## 0.23.2

### Patch Changes

- e63f125: chore(blob): Allow using the alternative API. No new feature, no bugfix here.

## 0.23.1

### Patch Changes

- 1cad24c: fix(blob): export all user facing errors

## 0.23.0

### Minor Changes

- 261319e: # Add abortSignal

  Adds `abortSignal` option to all methods. This allows users to cancel requests using an AbortController and passing its signal to the operation.

  Here's how to use it:

  ```ts
  const abortController = new AbortController();

  vercelBlob
    .put("canceled.txt", "test", {
      access: "public",
      abortSignal: abortController.signal,
    })
    .then((blob) => {
      console.log("Blob created:", blob);
    });

  setTimeout(function () {
    // Abort the upload
    abortController.abort();
  }, 100);
  ```

## 0.22.3

### Patch Changes

- 5b9b53d: Remove dependency pins in package.json.

## 0.22.2

### Patch Changes

- 13988ed: BREAKING CHANGE: The `contentType` field of the PutBlobResult is now optional which might break TS builds. This aligns the SDK typings with the actual Response of the Blob API.

## 0.22.1

### Patch Changes

- 69a5c52: fix(blob): correctly handle Node.js buffers as input

## 0.22.0

### Minor Changes

- 52c2fe2: feat(blob): add rate limited error

## 0.21.0

### Minor Changes

- 8e278f2: # feat(blob): add advanced multipart upload methods

  This exposes the three different multipart steps as functions of the SDK. Before this change every multipart upload was uncontrolled, meaning the full data was passed to the SDK and the SDK took care of chunking and uploading.

  Now it's possible to manually upload chunks and start and complete the multipart upload. All of the new functions can be used both on the server and the browser. There are two different API's that can be used.

  All parts uploaded must be at least 5MB in size, except for the last part. The last part can be smaller than 5MB. If you have a single part, it can be any size. All parts must be the same size, except for the last part.

  ## Individual methods

  Use `createMultipartUpload`, `uploadPart` and `completeMultipartUpload` to manage the upload.

  ```ts
  const { key, uploadId } = await vercelBlob.createMultipartUpload(
    "big-file.txt",
    { access: "public" }
  );

  const part1 = await vercelBlob.uploadPart(fullPath, "first part", {
    access: "public",
    key,
    uploadId,
    partNumber: 1,
  });

  const part2 = await vercelBlob.uploadPart(fullPath, "second part", {
    access: "public",
    key,
    uploadId,
    partNumber: 2,
  });

  const blob = await vercelBlob.completeMultipartUpload(
    fullPath,
    [part1, part2],
    {
      access: "public",
      key,
      uploadId,
    }
  );
  ```

  ## Multipart uploader

  For multipart methods, since some of the data remains consistent (uploadId, key), you can make use of the `createMultipartUploader`. This function stores certain data internally, making it possible to offer convinient `put` and `complete` functions.

  ```ts
  const uploader = await vercelBlob.createMultipartUploader("big-file.txt", {
    access: "public",
  });

  const part1 = await uploader.uploadPart(1, createReadStream(fullPath));

  const part2 = await uploader.uploadPart(2, createReadStream(fullPath));

  const blob = await uploader.complete([part1, part2]);
  ```

### Patch Changes

- 2ecc0e2: fix(blob): remove multipart boolean from copy options

## 0.20.0

### Minor Changes

- 5d71dda: # feat(blob): add `downloadUrl` and `getDownloadUrl`

  Adds a new blob property called `downloadUrl`. This URL will have the `content-disposition` set to `attachment` meaning it will force browsers to start a download instead of showing a preview. This URL can be used to implement download links. In addition to this new field the sdk is also exposing a new util function called `getDownloadUrl` which can also be used to derive a download URL from a blob URL.

## 0.19.0

### Minor Changes

- d44bd3b: feat(blob): add retry to all blob requests

  This change generalizes the way we request the internal Blob API. This moves api version, authorization, response validation and error handling all into one place.
  Also this adds a retry mechanism to the API requests

## 0.18.0

### Minor Changes

- dc7ba0e: feat(blob): allow inline content disposition for certain blobs

  Once you use this new version, then most common medias won't be automatically
  downloading but rather will display the content inline.

  Already uploaded files will not change their behavior.
  You can reupload them if you want to change their behavior.

  Fixes #509

## 0.17.1

### Patch Changes

- d4c06b0: chore(blob): fix types on client.put

## 0.17.0

### Minor Changes

- 898c14a: feat(blob): Add multipart option to reliably upload medium and large files

  It turns out, uploading large files using Vercel Blob has been a struggle for users.
  Before this change, file uploads were limited to around 200MB for technical reasons.
  Before this change, even uploading a file of 100MB could fail for various reasons (network being one of them).

  To solve this for good, we're introducting a new option to `put` and `upload` calls: `multipart: true`. This new option will make sure your file is uploaded parts by parts to Vercel Blob, and when some parts are failing, we will retry them. This option is available for server and client uploads.

  Usage:

  ```ts
  const blob = await put("file.png", file, {
    access: "public",
    multipart: true, // `false` by default
  });

  // and:
  const blob = await upload("file.png", file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    multipart: true,
  });
  ```

  If your `file` is a Node.js stream or a [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) then we will gradually read and upload it without blowing out your server or browser memory.

  More examples:

  ```ts
  import { createReadStream } from "node:fs";

  const blob = await vercelBlob.put(
    "elon.mp4",
    // this works 👍, it will gradually read the file from the system and upload it
    createReadStream("/users/Elon/me.mp4"),
    { access: "public", multipart: true }
  );
  ```

  ```ts
  const response = await fetch(
    "https://example-files.online-convert.com/video/mp4/example_big.mp4"
  );

  const blob = await vercelBlob.put(
    "example_big.mp4",
    // this works too 👍, it will gradually read the file from internet and upload it
    response.body,
    { access: "public", multipart: true }
  );
  ```

### Patch Changes

- fd1781f: feat(blob): allow folder creation

  This allows the creation of empty folders in the blob store. Before this change the SDK would always require a body, which is prohibited by the API.
  Now the the SDK validates if the operation is a folder creation by checking if the pathname ends with a trailling slash.

  ```ts
  const blob = await vercelBlob.put("folder/", {
    access: "public",
    addRandomSuffix: false,
  });
  ```

## 0.16.1

### Patch Changes

- ae0ba27: Ensure fetch is bound to globalThis
- 5624237: fix(deps): Change `jest-environment-jsdom` to a devDependency.

## 0.16.0

### Minor Changes

- 26a2acb: feat(blob): throw specific error when service unavailable

## 0.15.1

### Patch Changes

- f9c4061: fix(blob): Enforce content-type on fetch requests during token generation

  Before this change, we would not send the content-type header on fetch requests sent to your server during client uploads. We consider this a bugfix as it should have been sent before.

  ⚠️ If you upgrade to this version, and you're using any smart request body parser (like Next.js Pages API routes) then: You need to remove any `JSON.parse(request.body)` at the `handleUpload` step, as the body will be JSON by default now. This is valid for the `onBeforeGenerateToken` and `onUploadCompleted` steps.

## 0.15.0

### Minor Changes

- d57df99: Adds a new `mode: folded | expanded (default)` parameter to the list command options. When you pass `folded` to `mode`, then we automatically fold all files belonging to the same folder into a single folder entry. This allows you to build file browsers using the Vercel Blob API.

## 0.14.1

### Patch Changes

- 0e9fc17: Exports the ListBlobResultBlob so it can be imported from the @vercel/blob package.
- 41c4483: This introduces jsdoc comments for all functions that are publicly accessible in the @vercel/blob npm package.

## 0.14.0

### Minor Changes

- 9a6c44f: Add copy method to @vercel/blob package. This method offers the functionality to copy an existing blob file to a new path inside the blob store. #419

## 0.13.1

### Patch Changes

- 15de089: fix(deps): update dependency undici to v5.26.2 [security]

## 0.13.0

### Minor Changes

- 3cf97b1: This new version brings consistent and detailed errors about request failures (store does not exist, blob does not exist, store is suspended...).
  BREAKING CHANGE: head() will now throw instead of returning null when the blob does not exist.

## 0.12.5

### Patch Changes

- f033492: Handle relative urls in upload()'s callbackUrl #399

## 0.12.4

### Patch Changes

- d90e973: Removed `"types"` field from package.json to support `"moduleResolution": "Node16"`

## 0.12.3

### Patch Changes

- c0fe4e7: vercelBlob.head() now sends a `cacheControl` property

## 0.12.2

### Patch Changes

- 15f7eef: Fix types for old module resolution. Before this commit types for the main package would be imported with a dot in the import path on autocompletion.

## 0.12.1

### Patch Changes

- ae93246: Fix `Cannot find module '@vercel/blob/client' errors for JavaScript projects or TypeScript projects with an old moduleResolution setting.

## 0.12.0

### Minor Changes

- 8251462: This release introduces BREAKING CHANGES. Mostly, we've separated client and server needs better. While ensuring we only export what we currently think is useful to you.

  We have a completely new documentation about client (browser) uploads: https://vercel.com/docs/vercel-blob/client-upload.

  We've moved and renamed client-related utilities, including the ones to generate client tokens, to a separate entry file: `@vercel/blob/client`. Use it this way:

  ```ts
  import {
    upload,
    handleUpload,
    generateClientTokenFromReadWriteToken,
  } from "@vercel/blob/client";
  ```

  Here are the new features:

  - You can now pass a `clientPayload?: string` option during client uploads via the `upload` method. This payload can be used to attach metadata to your file, for example when updating a blog post cover image, you may want to pass: `clientPayload: JSON.stringify({ postId: 123 })`, so you can then use it server side to update the blog post.

  Here are the BREAKING CHANGES:

  - `handleBlobUpload` has moved to client/`handleUpload`
  - For client (browser) uploads, please use client/`upload` instead of `put`. Also, the `handleBlobUploadUrl` option has been renamed to `handleUploadUrl`.
  - `verifyCallbackSignature` is no more exported if you think you need it, open an issue
  - `BlobCommandOptions` type is no longer exported. This is an internal utility type. Other internal types were removed also but nobody was using them
  - `metadata` in `onBeforeGenerateToken` and `onUploadCompleted` has been renamed to `tokenPayload`

  Enjoy!

## 0.11.0

### Minor Changes

- b409aad: We added two new options on `put()`:

  - `addRandomSuffix: boolean`: Allows to disable or enable (default) random
    suffixes added to file paths
  - `cacheControlMaxAge: number`: Allows to configure the browser and edge cache,
    in seconds. Default to one year (browser) and 5 minutes (edge). The edge cache
    is currently always set to a maximum of 5 minutes. But can be lowered to 0

## 0.10.0

### Minor Changes

- e273673: BREAKING CHANGE: Some methods responses and types have been updated following a
  migration Vercel did to make Vercel Blob more robust and closer to the S3 API.

  Namely:

  - the urls generated by Vercel Blob have moved from:
    `public.blob.vercel-storage.com/zyzoioy8txfs14xe/somefile-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.txt`
    to
    `zyzoioy8txfs14xe.blob.vercel-storage.com/somefile-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.txt`
    This change has been done transparently: all previous blob urls are
    redirected to the new domain.
  - `.put()` no more sends back size and uploadedAt, use .head() to get this
    information. Refer to the PutBlobResult type.
  - `.list()` no more sends back contentType and contentDisposition on the
    blobs property. Refer to the ListBlobResult type.
  - `.del()` doesn't return any value (void). If the file was here prior to
    a del() call, then it's now deleted.
  - `BlobResult` type has been splitted to `PutBlobResult` for put() and
    `HeadBlobResult` for head(). Use them accordingly.

  We've reworked our README to better surface the browser-upload and
  server-upload methods.

## 0.9.3

### Patch Changes

- 978a817: Added an API version string when activated, related to multi bucket migration, no need to update for now.

## 0.9.2

### Patch Changes

- ce4b585: Add handleBlobUpload wrapper

## 0.9.1

### Patch Changes

- 08caff4: expose validUntil field

## 0.9.0

### Minor Changes

- 28ba58d: Implement Client Upload

## 0.8.3

### Patch Changes

- e976847: Align license to Apache 2.0 and fix urls in package.json

## 0.8.2

### Patch Changes

- 04e175d: fix response updateAt format

## 0.8.1

### Patch Changes

- Add missing url in blob type

## 0.8.0

### Minor Changes

- feat(API): Cleanup API responses

## 0.7.0

### Minor Changes

- 543a52e: restore list

## 0.6.3

### Patch Changes

- 5059992: remove list

## 0.6.2

### Patch Changes

- afa1e7a: send content-type

## 0.6.1

### Patch Changes

- fix vercelBlob.del to send back a single object or array when relevant to input

## 0.6.0

### Minor Changes

- del will now send back `HeadBlobResult | (HeadBlobResult | null)[] | null` based on how it's used and which blobs were deleted or not

## 0.5.0

### Minor Changes

- 45fd785: Implement bulk delete

## 0.4.0

### Minor Changes

- Add error handling

## 0.3.2

### Patch Changes

- Handle access denied deletions

## 0.3.1

### Patch Changes

- Release again

## 0.3.0

### Minor Changes

- e29855d: add blob list

## 0.2.6

### Patch Changes

- 5f6fe14: Test new release

## 0.2.5

### Patch Changes

- Test changeset in monorepo

## 0.2.4

### Patch Changes

- 39b15f2: Move from BLOB_STORE_WRITE_TOKEN to BLOB_READ_WRITE_TOKEN

## 0.2.1

### Patch Changes

- 969ef14: Fix filename computation

## 0.2.0

### Minor Changes

- a0f5d03: Added new methods

## 0.1.3

### Patch Changes

- e7e259e: Test releasing

## 0.1.0

### Minor Changes

- 33b712b: First "version"

## 0.0.2

### Patch Changes

- d1ec473: Testing changeset
- c33db99: Testing publish
