# Vercel Blob

Use these tools to manage files in a Vercel Blob store:

- Prefer `list` with a `prefix` to explore folders before uploading or deleting.
- Use `head` to read metadata without downloading content.
- Use `get` for small text or JSON blobs; large or binary files return URLs only.
- `put` uploads UTF-8 text. For binary uploads, use the Blob SDK or client uploads in application code.
- `del` accepts blob URLs or pathnames. Confirm the target before deleting production assets.
- `del` and `rename` pause for human approval, so they will not complete silently.
- `copy` and `rename` require `access` (`public` or `private`) like `put`. For `create_folder` it is optional and defaults to `public`.
- An existing blob's access level is in its URL hostname: `<storeId>.public.blob.vercel-storage.com` or `<storeId>.private.blob.vercel-storage.com`. Read it from there instead of guessing the `access` argument for `get`.
