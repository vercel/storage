Instructions:

- `cd test/next`
- `vc link` => link to `Curated Tests` => `vercel-storage-next-integration-test-suite`
- `vc env pull`
- `pnpm i`
- `pnpm dev`

The root page provides links to test suites. You can visit these test suites to quickly debug packages as you're developing them -- refreshing the page will fire off requests in every environment we test for and make sure they come back successfully.

This also deploys to a preview branch for every PR, so you can test your code in production!

## Visual regression tests

Visual regression tests generate a screenshot which is compared against a reference image. Visual regression tests are following the pattern `**/*!(.visual).test.ts` under the same `test/next/test` folder.

In case it is needed to update the reference image, run the test on the CI and copy the "actual" image generated within the uploaded artifacts. This is needed because playwright generates platform specific screenshots (see https://playwright.dev/docs/test-snapshots)

Visual regression tests run on a scheduled basis against the production `vercel-storage-next-integration-test-suite` link and on the `integration-tests-live` and `integration-tests-dev` workflows (together with all the other integration tests)

Note: Preview comments should be disabled in order to avoid screenshot flakiness
