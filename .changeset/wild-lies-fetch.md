---
'@vercel/blob': minor
---

We added two new options on `put()`:

- `addRandomSuffix: boolean`: Allows to disable or enable (default) random
  suffixes added to file paths
- `cacheControlMaxAge: number`: Allows to configure the browser and edge cache,
  in seconds. Default to one year (browser) and 5 minutes (edge). The edge cache
  is currently always set to a maximum of 5 minutes. But can be lowered to 0
