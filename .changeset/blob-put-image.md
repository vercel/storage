---
'@vercel/blob': minor
---

Add `putImage(pathname, bodyOrUrl, options)`: optimizes an image through Vercel Image Optimization and stores only the optimized output. The source can be the image content itself (string, File, Blob, Buffer or Stream) or a `URL` instance pointing at a public http(s) image, which is fetched server-side. The optimization parameters are top-level options — `width` (required), `quality`, `format` — alongside the options shared with `put` (access, addRandomSuffix, allowOverwrite, contentType for body sources, cacheControlMaxAge, ifMatch). Deprecates the `optimizeImage` option on `put` and the `putFromUrl` function in favor of `putImage`; both keep working.
