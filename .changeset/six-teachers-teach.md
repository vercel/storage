---
"@vercel/kv": major
---

BREAKING: Updates @upstash/redis to v1.34.0 which contains a small breaking change in the public API. The cursor field in scan commands is now returned as `string` instead of `number`.
