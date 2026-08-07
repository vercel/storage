---
'@vercel/edge-config': patch
'@vercel/global-config': patch
---

fix: correct the `stale-if-error` expiry computation so stale content is no longer served indefinitely once the configured window has passed.

The previous condition compared the cache's timestamp to `Date.now() + staleIfError * 1000`, which was always true for any positive `staleIfError`, so `stale-if-error` caches never expired. It now checks `Date.now() < cacheTime + staleIfError * 1000`, only serving stale content within the configured window. The same correction is applied to the network-error path (`createHandleStaleIfErrorException`).
