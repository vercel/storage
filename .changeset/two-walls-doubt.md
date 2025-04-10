---
'@vercel/blob': major
---

Vercel Blob is now GA! To celebrate this we're releasing the `1.0.0` version of the Vercel Blob SDK which includes multiple changes and improvements.

Changes:
- `addRandomSuffix` is now false by default
- Blobs are cached for one month, configurable and with a lower limit of 1 min. Which means you cannot configure the blob cache to be less than 1 minute.
- Random suffixes are now also added to the `pathname` of blob responses and `content-disposition` header.
- Overwriting blobs now requires to use `allowOverwrite: true`. Example:

```js
await put('file.png', file, { access: 'public' });

await put('file.png', file, { access: 'public' }); // This will throw

put('file.png', file, { access: 'public', allowOverwrite: true }); // This will work
```

How to upgrade:
- If you're using random suffixes by default, then add `addRandomSuffix: true` to `put` and `onBeforeGenerateToken` options.
- If you're overwriting blobs, then add `allowOverwrite: true` to `put` and `onBeforeGenerateToken` options.
- If you're using a cache-control of less than one minute, we recommend using a Vercel Function instead of a Blob. As Vercel Blob is primarily designed for caching content for a longer time.
- If you're displaying the `pathname` field of Blob responses in a UI, and using random suffixes, make sure you adpat the UI to show the longer `pathname`.
