---
"@vercel/edge-config": minor
---

Add optional fallback Edge Config bundling for improved resilience

You can now bundle fallback Edge Config versions directly into your build to protect against Edge Config service degradation or unavailability.

**How it works:**
- Your app continues using the latest Edge Config version under normal conditions
- If the Edge Config service is degraded, the SDK automatically falls back to the in-memory version
- If that's unavailable, it uses the bundled version from build time as a last resort
- This ensures your app maintains functionality even if Edge Config is temporarily unavailable

**Setup:**

Add the `edge-config prepare` command to your `prebuild` script:

```json
{
  "scripts": {
    "prebuild": "edge-config prepare"
  }
}
```

The prepare command reads your environment variables and bundles all connected Edge Configs. Use `--verbose` for detailed logs. Note that the bundled Edge Config stores count towards your build [function bundle size limit](https://vercel.com/docs/functions/limitations#bundle-size-limits).

**Build improvements:**

Using `edge-config prepare` also improves build performance and consistency:

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
