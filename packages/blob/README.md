# 🍙 @vercel/blob

The Vercel Blob JavaScript API client.

## Install

```sh
npm install @vercel/blob
```

## Examples

We have examples on the vercel.com documentation, there are two ways to upload files to Vercel Blob:

1. [Server uploads](https://vercel.com/docs/storage/vercel-blob/quickstart#server-uploads): This is the most common way to upload files. The file is first sent to your server and then to Vercel Blob. It's straightforward to implement, but you are limited to the request body your server can handle. Which in case of a Vercel-hosted website is 4.5 MB. **This means you can't upload files larger than 4.5 MB on Vercel when using this method.**
2. [Client uploads](https://vercel.com/docs/storage/vercel-blob/quickstart#client-uploads): This is a more advanced solution for when you need to upload larger files. The file is securely sent directly from the client (a browser for example) to Vercel Blob. This requires a bit more work to implement, but it allows you to upload files up to 500 MB.

## API

### `put(pathname, body, options)`

Upload a blob to the Vercel Blob API, and returns the URL of the blob along with some metadata.

```ts
async function put(
  pathname: string,
  body: ReadableStream | String | ArrayBuffer | Blob | File // All fetch body types are supported: https://developer.mozilla.org/en-US/docs/Web/API/fetch#body
  options: {
    access: 'public', // mandatory, as we will provide private blobs in the future
    contentType?: string, // by default inferred from pathname
    // `token` defaults to process.env.BLOB_READ_WRITE_TOKEN on Vercel
    // and can be configured when you connect more stores to a project
    // or using Vercel Blob outside of Vercel
    token?: string,
    addRandomSuffix?: boolean; // optional, allows to disable or enable random suffixes (defaults to `true`)
    cacheControlMaxAge?: number, // optional, a duration in seconds to configure the edge and browser caches. Defaults to one year for browsers and 5 minutes for edge cache. Can only be configured server side (either on server side put or during client token generation). The Edge cache maximum value is 5 minutes.
  }): Promise<{
      pathname: string;
      contentType: string;
      contentDisposition: string;
      url: string;
    }> {}
```

### del(url, options)

Delete one or multiple blobs by their full URL. This method doesn't return any value. If the blob url exists, it's deleted once del() returns.

```ts
async function del(
  url: string | string[],
  options?: {
    token?: string;
  }
): Promise<void> {}
```

### head(url, options)

Get the metadata of a blob by its full URL. Returns `null` when the blob does not exist.

```ts
async function head(
  url: string,
  options?: {
    token?: string;
  }
): Promise<{
  size: number;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  contentDisposition: string;
  url: string;
  cacheControl: string;
} | null> {}
```

### list(options)

List blobs and get their metadata in the store. With an optional prefix and limit. Paginate through them.

```ts
async function list(options?: {
  token?: string;
  limit?: number; // defaults to 1,000
  prefix?: string;
  cursor?: string;
}): Promise<{
  blobs: {
    size: number;
    uploadedAt: Date;
    pathname: string;
    url: string;
  }[];
  cursor?: string;
  hasMore: boolean;
}> {}
```

### client/`upload(pathname, body, options)`

The `upload` method is dedicated to client uploads. It fetches a client token using the `handleUploadUrl` before uploading the blob.

Read the [client uploads](https://vercel.com/docs/storage/vercel-blob/quickstart#client-uploads) documentation to know more.

```ts
async function upload(
  pathname: string,
  body: ReadableStream | String | ArrayBuffer | Blob | File // All fetch body types are supported: https://developer.mozilla.org/en-US/docs/Web/API/fetch#body
  options: {
    access: 'public', // mandatory, as we will provide private blobs in the future
    contentType?: string, // by default inferred from pathname
    // `token` defaults to process.env.BLOB_READ_WRITE_TOKEN on Vercel
    // and can be configured when you connect more stores to a project
    // or using Vercel Blob outside of Vercel
    handleUploadUrl?: string, // A string specifying the route to call for generating client tokens for client uploads
    clientPayload?: string, // A string that will be passed to the `onUploadCompleted` callback as `tokenPayload`. It can be used to attach data to the upload, like `JSON.stringify({ postId: 123 })`.
  }): Promise<{
      pathname: string;
      contentType: string;
      contentDisposition: string;
      url: string;
    }> {}
```

### client/`handleUpload(options)`

This is a server-side route helper to manage client uploads, it has two responsibilities:

1. Generate tokens for client uploads
2. Listen for completed client uploads, so you can update your database with the URL of the uploaded file for example

Read the [client uploads](https://vercel.com/docs/storage/vercel-blob/quickstart#client-uploads) documentation to know more.

```ts
async function handleUpload(options?: {
  token?: string; // default to process.env.BLOB_READ_WRITE_TOKEN
  request: IncomingMessage | Request;
  onBeforeGenerateToken: (
    pathname: string,
    clientPayload?: string
  ) => Promise<{
    allowedContentTypes?: string[]; // optional, defaults to no restriction
    maximumSizeInBytes?: number; // optional, defaults and maximum is 500MB (524,288,000 bytes)
    validUntil?: number; // optional, timestamp in ms, by default now + 30s (30,000)
    addRandomSuffix?: boolean; // see `put` options
    cacheControlMaxAge?: number; // see `put` options
    tokenPayload?: string; // optional, defaults to whatever the client sent as `clientPayload`
  }>;
  onUploadCompleted: (body: {
    type: 'blob.upload-completed';
    payload: {
      blob: PutBlobResult;
      tokenPayload?: string;
    };
  }) => Promise<void>;
  body:
    | {
        type: 'blob.upload-completed';
        payload: {
          blob: PutBlobResult;
          tokenPayload?: string;
        };
      }
    | {
        type: 'blob.generate-client-token';
        payload: {
          pathname: string;
          callbackUrl: string;
          clientPayload: string;
        };
      };
}): Promise<
  | { type: 'blob.generate-client-token'; clientToken: string }
  | { type: 'blob.upload-completed'; response: 'ok' }
> {}
```

## Examples

- [Next.js App Router examples](../../test/next/src/app/vercel/blob/)
- [https.get, axios, and got](../../test/next/src/app/vercel/blob/script.mts)

## How to list all your blobs

This will paginate through all your blobs in chunks of 1,000 blobs.
You can control the number of blobs in each call with `limit`.

```ts
let hasMore = true;
let cursor: string | undefined;
while (hasMore) {
  const listResult = await list({
    cursor,
  });
  console.log(listResult);
  hasMore = listResult.hasMore;
  cursor = listResult.cursor;
}
```

## Error handling

All methods of this module will throw if the request fails for either:

- missing parameters
- bad token or token doesn't have access to the resource
- or in the event of unknown errors

You should acknowledge that in your code by wrapping our methods in a try/catch block:

```ts
try {
  await put('foo', 'bar');
} catch (error) {
  if (error instanceof BlobAccessError) {
    // handle error
  } else {
    // rethrow
    throw error;
  }
}
```

## Releasing

```sh
pnpm changeset
git commit -am "New version"
```

Once such a commit gets merged in main, then GitHub will open a versioning PR you can merge. And the package will be automatically published to npm.

## A note about Vercel file upload limitations

When transferring a file to a Serverless or Edge Functions route on Vercel, then the request body is limited to 4.5 MB. If you need to send larger files then use the [client-upload](#client-upload) method.

## Running examples locally

- how to run examples locally (.env.local with token)
- how to run examples on Vercel (vc deploy)
- how to contribute (pnpm dev to rebuild, example uses local module)
- for Vercel contributors, link on how to run the API locally (edge-functions readme link, wrangler dev, pnpm dev for module)

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

const kv = await head("filepath", {
-  token: '<token>',
+  token: BLOB_TOKEN,
});

await kv.set('key', 'value');
```
