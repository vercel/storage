---
'@vercel/edge-config': minor
---

This package is now also published as `@vercel/global-config`, which is a drop-in replacement.

The default client now falls back to `process.env.GLOBAL_CONFIG` if `process.env.EDGE_CONFIG` is not defined. The same applies to `EDGE_CONFIG_TRACE_VERBOSE` and `EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR`, which fall back to their `GLOBAL_CONFIG`-prefixed counterparts.
