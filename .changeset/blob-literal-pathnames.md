---
'@vercel/blob': minor
---

Treat `.` and `..` in a blob pathname as ordinary characters instead of resolving them away.

S3 stores keys verbatim, so `put('folder/sub/..', …)` has always created a blob at exactly that key — but reading it back was impossible. `get()` sent the pathname through `fetch`, which resolves dot segments per RFC 3986 and asked for `folder/` instead, and `head`/`copy`/`del`/`rename` did the same server-side. `get()` now sends the path exactly as written, and the SDK moves to blob API version 13, where the server does the same.

Three smaller consequences of sending the path as written:

- A pathname is percent-encoded per segment, like `put` already does. `get('a b.txt')` still works; `get('a%20b.txt')` now reads the blob whose key literally contains `%20`, which is the one `put('a%20b.txt')` creates.
- `blob.downloadUrl` is no longer re-serialized through the URL parser, so it keeps the key as written.
- A failed request throws `Failed to fetch blob: <status>` without the status text, which is not available from the underlying client.
