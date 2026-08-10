---
'@vercel/blob': minor
---

Add `putImage(pathname, bodyOrUrl, options)`: optimizes an image through Vercel Image Optimization and stores only the optimized output. The source can be the image content itself (string, File, Blob, Buffer or Stream) or a `URL` instance pointing at a public http(s) image, which is fetched server-side. Options mirror `put` (access, addRandomSuffix, allowOverwrite, cacheControlMaxAge, ifMatch) plus the required `optimizeImage` parameters (`width`, `quality`, `format`); `contentType` is not accepted since the stored content type always comes from the optimizer output. Deprecates the `optimizeImage` option on `put` and the `putFromUrl` function in favor of `putImage`; both keep working.
