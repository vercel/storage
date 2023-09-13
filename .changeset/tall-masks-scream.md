---
'@vercel/blob': minor
---

This release introduces BREAKING CHANGES. Mostly, we've separated client and server needs better. While ensuring we only export what we currently think is useful to you.

We have a completely new documentation about client (browser) uploads: https://vercel.com/docs/storage/vercel-blob/quickstart#client-uploads.

We've moved and renamed client-related utilities, including the ones to generate client tokens, to a separate entry file: `@vercel/blob/client`. Use it this way:

```ts
import {
  upload,
  handleUpload,
  generateClientTokenFromReadWriteToken,
} from '@vercel/blob/client';
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
