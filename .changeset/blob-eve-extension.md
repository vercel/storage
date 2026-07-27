---
"@vercel/blob": minor
---

Add `@vercel/blob/eve` Eve extension with tools for listing, reading, uploading, deleting, copying, renaming, and creating folders in a Blob store.

The destructive tools `del` and `rename` are gated on human approval (`approval: always()`) and pause the run until a person responds. Consumers can relax this with a directory mount override.

`zod` is now an optional peer dependency (`^4`) rather than a runtime dependency, alongside the existing optional `eve` peer. Both must be installed to use the `@vercel/blob/eve` subpath; neither is needed by the core SDK.

`CreateFolderCommandOptions` is widened to include the `storeId` and `oidcToken` auth options, so `createFolder` now declares the same Vercel OIDC authentication options as the other Blob commands. These options were already forwarded at runtime; this is a type-only, backward-compatible change.
