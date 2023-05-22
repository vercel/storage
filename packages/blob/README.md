# 🍙 @vercel/blob

The Vercel Blob JavaScript API client.

## Install

```sh
npm install @vercel/blob
```

## Usage

```ts
import * as vercelBlob from '@vercel/blob';

// usage
async function someMethod() {
  const blob = await vercelBlob.put(
    'profilesv1/user-12345.txt', // pathname for the blob
    'Hello World!', // body
    { access: 'public' }, // mandatory options
  );

  console.log(blob.url);
  // https://public.blob.vercel-storage.com/n1g9m63etib6gkcjqjpspsiwe7ea/profilesv1/user-12345-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.txt
}
```

## API

### `put(pathname, body, options)`

Upload a blob to the Vercel Blob API, and returns the URL of the blob.

```ts
async function put(
  pathname: string,
  body: ReadableStream | String | ArrayBuffer | Blob // All fetch body types are supported: https://developer.mozilla.org/en-US/docs/Web/API/fetch#body
  options: {
    access: 'public', // mandatory, as we will provide private blobs in the future
    contentType?: string, // by default inferred from pathname
    // `token` defaults to process.env.BLOB_READ_WRITE_TOKEN on Vercel
    // and can be configured when you connect more stores to a project
    // or using Vercel Blob outside of Vercel
    token?: string,
  }): Promise<{
      size: number;
      uploadedAt: Date;
      pathname: string;
      contentType: string;
      contentDisposition: string;
      url: string;
    }> {}
```

### del(url, options)

Delete one or multiple blobs by their full URL. Returns the deleted blob(s) or null when not found.

```ts
async function del(
  url: string | string[],
  options?: {
    token?: string;
  },
): Promise<
  | {
      size: number;
      uploadedAt: Date;
      pathname: string;
      contentType: string;
      contentDisposition: string;
      url: string;
    }
  | null
  | ({
      size: number;
      uploadedAt: Date;
      pathname: string;
      contentType: string;
      contentDisposition: string;
      url: string;
    } | null)[]
> {}
```

### head(url, options)

Get the metadata of a blob by its full URL. Returns `null` when the blob does not exist.

```ts
async function head(
  url: string,
  options?: {
    token?: string;
  },
): Promise<{
  size: number;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  contentDisposition: string;
  url: string;
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
    contentType: string;
    contentDisposition: string;
    url: string;
  }[];
  cursor?: string;
  hasMore: boolean;
}> {}
```

## Examples

- [Next.js App Router examples](../../test/next/src/app/vercel/blob/)
- [https.get, axios, and got](../../test/next/src/app/vercel/blob/script.ts)

### Next.js App Router example

This example shows a form uploading a file to the Vercel Blob API.

```tsx
// /app/UploadForm.tsx

'use client';

import type { BlobResult } from '@vercel/blob';
import { useState } from 'react';

export default function UploadForm() {
  const [blob, setBlob] = useState<BlobResult | null>(null);

  return (
    <>
      <form
        action="/api/upload"
        method="POST"
        encType="multipart/form-data"
        onSubmit={async (event) => {
          event.preventDefault();

          const formData = new FormData(event.currentTarget);
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          const blob = (await response.json()) as BlobResult;
          setBlob(blob);
        }}
      >
        <input type="file" name="file" />
        <button type="submit">Upload</button>
      </form>
      {blob && (
        <div>
          Blob url: <a href={blob.url}>{blob.url}</a>
        </div>
      )}
    </>
  );
}
```

```ts
// /app/api/upload/route.ts

import * as vercelBlob from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file') as File;

  if (!file) {
    return NextResponse.json(
      { message: 'No file to upload.' },
      { status: 400 },
    );
  }

  const blob = await vercelBlob.put(file.name, file, { access: 'public' });

  return NextResponse.json(blob);
}
```

## How to list all your blobs

This will paginate through all your blobs in chunks of 1,000 blobs.
You can control the number of blobs in each call with `limit`.

```ts
let hasMore = true;
let cursor: string | undefined;
while (hasMore) {
  const listResult = await vercelBlob.list({
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
  await vercelBlob.put('foo', 'bar');
} catch (error) {
  if (error instanceof vercelBlob.BlobAccessError) {
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

When using Serverless or Edge Functions on Vercel, the request body size is limited to 4MB.

When you want to send files larger than that to Vercel Blob, you can do so by using `@vercel/blob` from a regular Node.js script context (like at build time). This way the request body will be sent directly to Vercel Blob and not via an Edge or Serverless Function.

We plan to allow sending larger files to Vercel Blob from browser contexts soon.

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

TEST PIPELINE
