---
"@vercel/kv": major
---

feat(kv): Switch to `default` for fetch `cache` option

BREAKING CHANGE: When using Next.js and vercel/kv, you may have kv requests and/or Next.js resources using kv being cached when you don't want them to.

If that's the case, then opt-out of caching with
https://nextjs.org/docs/app/api-reference/functions/unstable_noStore.

On the contrary, if you want to enforce caching of resources you can use https://nextjs.org/docs/app/api-reference/functions/unstable_cache.
