---
'@vercel/blob': patch
---

Read the Vercel OIDC token via the `@vercel/oidc` package (`getVercelOidcTokenSync`) instead of an inlined copy. This makes the dependency explicit and discoverable, and matches how other Vercel packages consume OIDC. Behavior is unchanged except for one edge case: a blank `x-vercel-oidc-token` request-context header now resolves to no token rather than falling back to `VERCEL_OIDC_TOKEN`.
