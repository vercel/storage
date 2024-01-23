---
"@vercel/edge-config": major
---

- Use stale-while-revalidate during development
- Don't throw generic errors
- Make the return values read only
- Use the `privateEdgeConfig` global when available
- Export a clone function to support the read only behaviour
