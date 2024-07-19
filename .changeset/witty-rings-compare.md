---
"@vercel/edge-config": patch
---

gracefully handle when an empty string is supplied as the key

- `get("")` will return `undefined`
- `has("")` will return `false`
- `getAll(["a", ""])` will ignore the empty string
