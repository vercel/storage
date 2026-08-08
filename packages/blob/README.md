# 🍙 @vercel/blob

The Vercel Blob JavaScript API client.

---

<p align="center">
  👉 
  <a href="https://vercel.com/docs/vercel-blob">
    <b>Quickstart</b>
  </a> — 
  <a href="https://vercel.com/docs/vercel-blob/using-blob-sdk">
    <b>SDK Reference</b>
  </a>
   👈
  </b>
</p>

---

## Installation

```sh
npm install @vercel/blob
```

## Quickstart

We have examples on the vercel.com documentation, there are two ways to upload files to Vercel Blob:

1. [Server uploads](https://vercel.com/docs/vercel-blob/server-upload): This is the most common way to upload files. The file is first sent to your server and then to Vercel Blob. It's straightforward to implement, but you are limited to the request body your server can handle. Which in case of a Vercel-hosted website is 4.5 MB. **This means you can't upload files larger than 4.5 MB on Vercel when using this method.**
2. [Client uploads](https://vercel.com/docs/vercel-blob/client-upload): This is a more advanced solution for when you need to upload larger files. The file is securely sent directly from the client (a browser for example) to Vercel Blob. This requires a bit more work to implement, but it allows you to upload files up to 5 TB.

## Eve extension

Mount Vercel Blob tools in an [Eve](https://eve.dev) agent.

`eve` and `zod` are optional peer dependencies: they are only needed for the
`@vercel/blob/eve` subpath, and the consuming agent supplies both.

```sh
pnpm add @vercel/blob eve zod
```

```ts
// agent/extensions/blob.ts
import blob from '@vercel/blob/eve';

export default blob({
  token: process.env.BLOB_READ_WRITE_TOKEN,
});
```

The extension declares a config schema, so its default export is a mount
factory that must be called — even when every field is left out. Pass an empty
object to let the tools fall back to `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`,
and `VERCEL_OIDC_TOKEN` from the environment:

```ts
// agent/extensions/blob.ts
import blob from '@vercel/blob/eve';

export default blob({});
```

The bare `export { default } from '@vercel/blob/eve'` form only works for
extensions that declare no config, and will not type-check here.

Mounted tools include `list`, `head`, `get`, `put`, `del`, `copy`, `rename`, and `create_folder`.

### Approval for destructive tools

`del` and `rename` ship with `approval: always()`, so each call pauses the run
and waits for a person before it executes. To relax that, use a directory mount
and override the tool in a same-named slot:

```
agent/extensions/blob/
  extension.ts
  tools/del.ts
```

```ts
// agent/extensions/blob/extension.ts
import blob from '@vercel/blob/eve';

export default blob({});
```

```ts
// agent/extensions/blob/tools/del.ts
import { del } from '@vercel/blob/eve/tools';
import { defineTool } from 'eve/tools';
import { never } from 'eve/tools/approval';

export default defineTool({ ...del, approval: never() });
```

The directory name is still the mount namespace, so the tool stays `blob__del`.
See [Eve extensions](https://eve.dev/docs/extensions) for mount namespaces and overrides,
and [human-in-the-loop](https://eve.dev/docs/human-in-the-loop) for the approval helpers.

## Releasing

Make sure to include a changeset in your PR. You can do this by running:

```sh
pnpm changeset
git commit -am "changeset"
git push
```

Once such a commit gets merged in main, then GitHub will open a versioning PR you can merge. And the package will be automatically published to npm.

## A note for Vite users

`@vercel/blob` reads the token from the environment variables on `process.env`. In general, `process.env` is automatically populated from your `.env` file during development, which is created when you run `vc env pull`. However, Vite does not expose the `.env` variables on `process.env.`

You can fix this in **one** of following two ways:

1. You can populate `process.env` yourself using something like `dotenv-expand`:

```shell
pnpm install --save-dev dotenv dotenv-expand
```

```js
// vite.config.js
import dotenvExpand from 'dotenv-expand';
import { loadEnv, defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // This check is important!
  if (mode === 'development') {
    const env = loadEnv(mode, process.cwd(), '');
    dotenvExpand.expand({ parsed: env });
  }

  return {
    ...
  };
});
```

2. You can provide the credentials explicitly, instead of relying on a zero-config setup. For example, this is how you could create a client in SvelteKit, which makes private environment variables available via `$env/static/private`:

```diff
import { put } from '@vercel/blob';
+ import { BLOB_TOKEN } from '$env/static/private';

const blob = await head("filepath", {
-  token: '<token>',
+  token: BLOB_TOKEN,
});
```
