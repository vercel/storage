# [Vercel Storage](https://vercel.com/docs/storage)

## Packages

- `@vercel/edge-config` Ultra-low latency data at the edge — [Documentation](https://vercel.com/docs/storage/edge-config) | [Source](./packages/edge-config)
- `@vercel/blob` Fast object storage — [Documentation](https://vercel.com/docs/storage/vercel-blob) | [Source](./packages/blob)

## Deprecated Packages

> **Note:** Vercel Postgres and Vercel KV products are now sunset. You can install other postgres and KV storage solutions from the [Vercel Marketplace](https://vercel.com/marketplace) as native integrations to your Vercel project.
>
> The source code for these deprecated packages is preserved in the [`vercel-kv-vercel-postgres-archive`](https://github.com/vercel/storage/tree/vercel-kv-vercel-postgres-archive) branch.

### Migration Guides

- **@vercel/postgres** → Use [@neondatabase/serverless](https://neon.tech/docs/serverless/serverless-driver) or [@neondatabase/vercel-postgres-compat](https://www.npmjs.com/package/@neondatabase/vercel-postgres-compat) (drop-in replacement). See the [Neon transition guide](https://neon.com/docs/guides/vercel-postgres-transition-guide#compatibility-notes).
- **@vercel/kv** → Use [@upstash/redis](https://www.npmjs.com/package/@upstash/redis). See the [Upstash Redis documentation](https://upstash.com/docs/redis/overall/getstarted).
