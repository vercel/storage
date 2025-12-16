---
"@vercel/edge-config": minor
---

**NEW** Edge Config Snapshots

You can now bundle a snapshot of your Edge Config along with your deployment.
- snapshot is used as a fallback in case the Edge Config service is unavailable
- snapshot is consistently used during builds, ensuring your app uses a consistent version and reducing build time
- snapshot will be used in the future to immediately bootstrap the Edge Config SDK (soon)

**How it works:**
- Your app continues using the latest Edge Config version under normal conditions
- If the Edge Config service is degraded, the SDK automatically falls back to the in-memory version
- If that's unavailable, it uses the snapshot embedded at build time as a last resort
- This ensures your app maintains functionality even if Edge Config is temporarily unavailable

Note that this means your application may serve outdated values in case the Edge Config service is unavailable at runtime. In most cases this is preferred to not serving any values at all.

**Setup:**

Add the `edge-config snapshot` command to your `prebuild` script:

```json
{
  "scripts": {
    "prebuild": "edge-config snapshot"
  }
}
```

The snapshot command reads your environment variables and bundles all connected Edge Configs. Use `--verbose` for detailed logs. Note that the bundled Edge Config stores count towards your build [function bundle size limit](https://vercel.com/docs/functions/limitations#bundle-size-limits).

You can further configure your client to throw errors in case it can not find the Edge Config snapshot by editing the connection string stored in the `EDGE_CONFIG` environment variable and appending `&snapshot=required`. You can also specify `snapshot: "required"` when creating clients using `createClient`.

**Build improvements:**

Using `edge-config snapshot` also improves build performance and consistency:

- **Faster builds:** The SDK fetches each Edge Config store once per build instead of once per key
- **Eliminates inconsistencies:** Prevents Edge Config changes between individual key reads during the build
- **Automatic optimization:** No code changes required—just add the prebuild script

**Timeout configuration:**

You can now configure request timeouts to prevent slow Edge Config reads from blocking your application:

```ts
// Set timeout when creating the client
const client = createClient(process.env.EDGE_CONFIG, {
  timeoutMs: 1000 // timeout after 1 second
});

// Or per-request
await client.get('key', { timeoutMs: 500 });
```

When a timeout occurs, the SDK will fall back to the bundled Edge Config if available, or throw an error otherwise. This is particularly useful when combined with bundled Edge Configs to ensure fast, resilient reads.
