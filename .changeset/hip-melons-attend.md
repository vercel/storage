---
'@vercel/edge-config': minor
---

Add getAll() method

- `getAll()` allows fetching all items of an Edge Config
- `getAll(keys: string[])` allows fetching a subset of the Edge Config's items

Use `process.env.EDGE_CONFIG` instead of `process.env.VERCEL_EDGE_CONFIG` for the default Edge Config.
