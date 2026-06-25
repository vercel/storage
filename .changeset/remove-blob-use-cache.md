---
'@vercel/blob': minor
---

Deprecate the `useCache` option on `get()`. The backend no longer honors the `cache=0` query parameter it produced, so the option is now a no-op — reads always go through the standard caching path. The option is still accepted (and ignored) to avoid breaking existing callers, and will be removed in a future major version.
