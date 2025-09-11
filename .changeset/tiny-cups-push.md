---
'@vercel/blob': major
---

BREAKING CHANGE:
To continue receiving onUploadCompleted callback once a file is uploaded with Client Uploads, you need to provide the callbackUrl at the onBeforeGenerateToken step when using handleUpload.

**Before:**

```ts
await handleUpload({ body, request,
  onBeforeGenerateToken: async (pathname) => { /* options */ },
  onUploadCompleted: async ({ blob, tokenPayload }) => { /* code */ },
});
```

**After:**

```ts
await handleUpload({ body, request,
  onBeforeGenerateToken: async (pathname) => { callbackUrl: 'https://example.com/api/upload' },
  onUploadCompleted: async ({ blob, tokenPayload }) => { /* code */ },
});
```

See the updated documentation at https://vercel.com/docs/vercel-blob/client-upload to know more.

**Details:**

Before this commit, during Client Uploads, we would infer the `callbackUrl` at the client side level (browser) based on location.href (for convenience).
This is wrong and allows browsers to redirect the onUploadCompleted callback to a different website.

While not a security risk, because the blob urls are already public and the browser knows them, it still pose a risk of database drift if you're relying on onUploadCompleted callback to update any system on your side.
