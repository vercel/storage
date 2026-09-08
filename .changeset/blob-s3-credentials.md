---
'@vercel/blob': minor
---

Add `@vercel/blob/s3` with `blobS3Credentials()`, a credentials provider for the AWS S3 SDK. It exchanges your Blob auth (OIDC token or `BLOB_READ_WRITE_TOKEN`) for temporary S3-compatible credentials that work against the Blob S3-compatible endpoint (`https://public.blob.vercel-storage.com` or `https://private.blob.vercel-storage.com`, bucket = store id). Also exports `issueBlobS3Credentials()` and `credentialsFromSignedToken()`.
