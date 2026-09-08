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

## Using the AWS S3 SDK

Vercel Blob exposes an S3-compatible API. Point any S3 client at `https://public.blob.vercel-storage.com` (or `https://private.blob.vercel-storage.com` for private stores) and use your store id as the bucket. `@vercel/blob/s3` turns your Blob auth (OIDC or `BLOB_READ_WRITE_TOKEN`) into temporary credentials the SDK refreshes on its own:

```ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { blobS3Credentials } from '@vercel/blob/s3';

const s3 = new S3Client({
  endpoint: 'https://public.blob.vercel-storage.com',
  region: 'auto',
  credentials: blobS3Credentials(),
});

await s3.send(
  new PutObjectCommand({ Bucket: '<store id>', Key: 'hello.txt', Body: 'hi' }),
);
```

You can also use static credentials: the store id as access key id and the read-write token as secret access key.

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
