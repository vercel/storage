---
'@vercel/blob': minor
---

Add `putImage(pathname, bodyOrUrl, options)`: optimizes an image through Vercel Image Optimization and stores only the optimized output. The source can be the image content itself (string, File, Blob, Buffer or Stream) or a public http(s) URL, which is fetched server-side. Options are shared with `put` (access, addRandomSuffix, allowOverwrite, contentType for body sources, cacheControlMaxAge, ifMatch) plus the required `optimizeImage` parameters. Deprecates the `optimizeImage` option on `put` and the `putFromUrl` function in favor of `putImage`; both keep working.
