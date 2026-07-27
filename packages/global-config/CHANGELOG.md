# @vercel/global-config

## 1.5.0

### Minor Changes

- 5c2d8bf: Introduce `@vercel/global-config` as the new name for `@vercel/edge-config`.

  The package is a drop-in replacement: all existing exports are unchanged, and the exported types are additionally aliased as `GlobalConfigClient`, `GlobalConfigItems`, `GlobalConfigValue` and `EmbeddedGlobalConfig`.

  The default client now reads the connection string from `process.env.GLOBAL_CONFIG`, falling back to `process.env.EDGE_CONFIG` if it is not defined. The same applies to `GLOBAL_CONFIG_TRACE_VERBOSE` and `GLOBAL_CONFIG_DISABLE_DEVELOPMENT_SWR`.

  Connection strings using `https://global-config.vercel.com` are now supported, in addition to the existing `https://edge-config.vercel.com` and `edge-config:` formats.
