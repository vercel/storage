---
'@vercel/blob': major
---

**BREAKING CHANGE:**

To continue receiving onUploadCompleted callback once a file is uploaded with Client Uploads when **not hosted on Vercel**, you need to provide the callbackUrl at the onBeforeGenerateToken step when using handleUpload.

**When hosted on Vercel:**
No code changes required. The callback URL is automatically inferred from Vercel environment variables.

**When not hosted on Vercel:**

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
  onBeforeGenerateToken: async (pathname) => { 
    return { callbackUrl: 'https://example.com/api/upload' };
  },
  onUploadCompleted: async ({ blob, tokenPayload }) => { /* code */ },
});
```

**For local development:**
Set the `VERCEL_BLOB_CALLBACK_URL` environment variable to your tunnel URL:

```bash
VERCEL_BLOB_CALLBACK_URL=https://abc123.ngrok-free.app
```

See the updated documentation at https://vercel.com/docs/vercel-blob/client-upload to know more.

**Details:**

Before this commit, during Client Uploads, we would infer the `callbackUrl` at the client side level (browser) based on location.href (for convenience).
This is wrong and allows browsers to redirect the onUploadCompleted callback to a different website.

While not a security risk, because the blob urls are already public and the browser knows them, it still pose a risk of database drift if you're relying on onUploadCompleted callback to update any system on your side.
