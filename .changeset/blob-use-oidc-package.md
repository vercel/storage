---
'@vercel/blob': patch
---

Read the Vercel OIDC request context via the `@vercel/oidc` package instead of an inlined copy. This makes the OIDC dependency explicit (and discoverable) without changing behavior — Blob keeps trimming tokens and ignoring blank `x-vercel-oidc-token` headers in favor of `VERCEL_OIDC_TOKEN`.
