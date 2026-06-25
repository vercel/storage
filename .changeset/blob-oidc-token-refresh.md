---
'@vercel/blob': patch
---

Read the Vercel OIDC token via `@vercel/oidc`'s refreshing `getVercelOidcToken` instead of the non-refreshing `getVercelOidcTokenSync`. This refreshes an expired token in development environments. In production with a valid token, behavior is unchanged. If a refresh is needed but fails, the token is treated as absent so callers still fall back to `BLOB_READ_WRITE_TOKEN`.
