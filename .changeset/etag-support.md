---
"@vercel/blob": minor
---

Add ETag support for conditional writes (optimistic concurrency control)

- Return `etag` in all blob responses (put, copy, head, list, multipart)
- Accept `ifMatch` option in put/copy/createMultipartUpload for conditional writes
- Add `BlobPreconditionFailedError` for ETag mismatch (HTTP 412)

## Usage Example: Preventing Lost Updates

When multiple users or processes might update the same blob concurrently, use `ifMatch` to ensure you don't overwrite someone else's changes:

```typescript
import { put, head, BlobPreconditionFailedError } from '@vercel/blob';

// User 1: Read the current blob and get its ETag
const metadata = await head('config.json');
console.log(metadata.etag); // e.g., '"abc123"'

// User 2: Also reads the same blob (same ETag)
const metadata2 = await head('config.json');

// User 1: Updates the blob with ifMatch
// This succeeds because the ETag matches
const result1 = await put('config.json', JSON.stringify({ setting: 'user1' }), {
  access: 'public',
  allowOverwrite: true, // Required when updating existing blobs
  ifMatch: metadata.etag, // Only write if ETag still matches
});
console.log(result1.etag); // New ETag: '"def456"'

// User 2: Tries to update with their (now stale) ETag
// This fails because User 1 already changed the blob
try {
  await put('config.json', JSON.stringify({ setting: 'user2' }), {
    access: 'public',
    allowOverwrite: true,
    ifMatch: metadata2.etag, // Stale ETag - blob was modified!
  });
} catch (error) {
  if (error instanceof BlobPreconditionFailedError) {
    // The blob was modified since we last read it
    // Re-fetch, merge changes, and retry
    const freshMetadata = await head('config.json');
    await put('config.json', JSON.stringify({ setting: 'user2' }), {
      access: 'public',
      allowOverwrite: true,
      ifMatch: freshMetadata.etag, // Use fresh ETag
    });
  }
}
```

### Key Points

- **`allowOverwrite: true`**: Required when updating an existing blob at the same path
- **`ifMatch`**: Only performs the write if the blob's current ETag matches this value
- **Combined**: "Overwrite, but only if the blob hasn't changed since I last read it"
- ETags follow RFC 7232 format with surrounding quotes (e.g., `"abc123"`)
