---
'@vercel/blob': patch
---

Fix `presignUrl` rejecting non-ASCII pathnames (for example `uploads/Skærmbillede.png`) with a false "Blob path does not match the signed token scope" error. The delegation token payload was decoded with `atob`, which returns one character per byte, so UTF-8 pathnames were compared as mojibake. The payload bytes are now decoded as UTF-8 when `TextDecoder` is available; runtimes that provide `atob` but no `TextDecoder` (React Native on Hermes) keep the previous behaviour.
