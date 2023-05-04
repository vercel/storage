Instructions:

- `cd packages/integration`
- `vc link` => link to `Curated Tests` => `vercel-storage-integration-test-suite`
- `vc env pull`
- `pnpm i`
- `pnpm dev`

The root page provides links to test suites. You can visit these test suites to quickly debug packages as you're developing them -- refreshing the page will fire off requests in every environment we test for and make sure they come back successfully.

This also deploys to a preview branch for every PR, so you can test your code in production!
