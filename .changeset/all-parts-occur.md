---
"@vercel/blob": minor
---

Add private storage support (beta), a new `get()` method, and conditional gets

**Private storage (beta)**

You can now upload and read private blobs by setting `access: 'private'` on `put()` and `get()`. Private blobs require authentication to access — they are not publicly accessible via their URL.

**New `get()` method**

Fetch blob content by URL or pathname. Returns a `ReadableStream` along with blob metadata (url, pathname, contentType, size, etag, etc.).

**Conditional gets with `ifNoneMatch`**

Pass an `ifNoneMatch` option to `get()` with a previously received ETag. When the blob hasn't changed, the response returns `statusCode: 304` with `stream: null`, avoiding unnecessary re-downloads.

**Example**

```ts
import { put, get } from '@vercel/blob';

// Upload a private blob
const blob = await put('user123/avatar.png', file, { access: 'private' });

// Read it back
const response = await get(blob.pathname, { access: 'private' });
// response.stream — ReadableStream of the blob content
// response.blob — metadata (url, pathname, contentType, size, etag, ...)

// Conditional get — skip download if unchanged
const cached = await get(blob.pathname, {
  access: 'private',
  ifNoneMatch: response.blob.etag,
});
if (cached.statusCode === 304) {
  // Blob hasn't changed, reuse previous data
}
```

Learn more: https://vercel.com/docs/vercel-blob/private-storage
