Instructions:

- `vc link` => link to `Vercel Labs` => `vercel-postgres-test-suite`
- `vc env pull`
- `pnpm i`
- `pnpm dev`

Visit the following routes

- /api/appdir/node
- /api/appdir/edge
- /appdir/node
- /appdir/edge
- /api/pagesdir/node
- /api/pagesdir/edge

All try to make the same query, all fail similarly. Fwiw, the node error (hanging forever) is affecting SvelteKit projects as well, and it wasn't last night! But I don't think it had anything to do with @vercel/postgres or @neondatabase/serverless -- I git bisected both of them and nothing that happened in the last day fixes the issue.
