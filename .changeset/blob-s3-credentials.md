---
'@vercel/blob': minor
---

Add `@vercel/blob/s3` with `blobS3Credentials()`, a credentials provider for the AWS S3 SDK. It exchanges the Vercel OIDC token (`VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`, or the `oidcToken`/`storeId` options) for temporary S3-compatible credentials via `POST /blob/s3-credentials`, usable against the Blob S3-compatible endpoint (`https://public.blob.vercel-storage.com` or `https://private.blob.vercel-storage.com`, bucket = store id). Also exports the one-shot `issueBlobS3Credentials()`.
