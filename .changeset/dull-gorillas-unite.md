---
"@vercel/blob": patch
"vercel-storage-integration-test-suite": patch
---

# feat(blob): add blob download url

Adds a new blob property called `downloadUrl`. This URL will have the `content-disposition` set to `attachment` meaning it will force browsers to start a download instead of showing a preview. This URL can be used to implement download links. In addition to this new field the sdk is also exposing a new util function called `getDownloadUrl` which can also be used to derive a download URL from a blob URL.
