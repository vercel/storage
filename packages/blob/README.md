# 🍙 @vercel/blob

The Vercel Blob JavaScript API client.

## Install

```sh
npm install @vercel/blob
```

## Examples

You can either upload files from the server or directly from a client (the browser):

- When accepting files on your Vercel-hosted website: use the browser upload method, so you can upload files larger than 4MB.
- When uploading files part of a build process, or if you do not need more than 4MB: use the server upload method.

### Browser Upload

Uploading from browsers is a three-step process:

1. A _client token_ is generated via a route and sent to the browser. This token is restricted to a specific `pathname` and will be valid for 30s (this can be customized).
2. The file is uploaded to the Vercel Blob API from the browser, using the token from 1.
3. Your server is notified of the upload completion via a webhook.

Here's a Next.js app router example, and our browser upload helpers are framework-independent.

```tsx
// /app/UploadForm.tsx
'use client';

import { put, type PutBlobResult } from '@vercel/blob';
import { useState, useRef } from 'react';

export default function UploadForm() {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  return (
    <>
      <h1>App Router Client Upload</h1>

      <form
        onSubmit={async (event): Promise<void> => {
          event.preventDefault();

          const file = inputFileRef.current?.files?.[0];
          if (!file) {
            return;
          }

          // Step 2. Upload the file from the browser using the restricted client token
          const blobResult = await put(file.name, file, {
            access: 'public',
            // This is the URL to generate the client token for this `file.name`
            handleBlobUploadUrl: '/api/upload/avatars',
          });

          setBlob(blobResult);
        }}
      >
        <input name="file" ref={inputFileRef} type="file" />
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
// /app/api/upload/avatars/route.ts

import { handleBlobUpload, type HandleBlobUploadBody } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleBlobUploadBody;

  try {
    const jsonResponse = await handleBlobUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Step 1. Generate a client token for the browser to upload the file

        // ⚠️ Authenticate users before allowing client tokens to be generated and sent to browsers. Otherwise, you're exposing your Blob store to be an anonymous upload platform.
        // See https://nextjs.org/docs/pages/building-your-application/routing/authenticating for more information
        const { user, userCanUpload } = await auth(request, pathname);

        if (!userCanUpload) {
          throw new Error('not authenticated or bad pathname');
        }

        return {
          maximumSizeInBytes: 10_000_000, // optional, default and maximum is 500MB
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/gif'], // optional, default is no restriction
          metadata: JSON.stringify({
            // optional, sent to your server on upload completion
            userId: user.id,
          }),
        };
      },
      onUploadCompleted: async ({ blob, metadata }) => {
        // Step 3. Get notified of browser upload completion

        try {
          // Run any logic after the file upload completed
          const parsedMetadata = JSON.parse(metadata);
          await db.update({ avatar: blob.url, userId: parsedMetadata.userId });
        } catch (error) {
          // If you return anything but 2xx, the "onUploadCompleted" webhook will retry for 5 times
          throw new Error('Could not update user');
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
```

### Server Upload

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
  // https://zyzoioy8txfs14xe.public.blob.vercel-storage.com/profilesv1/user-12345-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.txt
}
```

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
    // on the client `token` is mandatory and must be generated by "generateClientTokenFromReadWriteToken"
    token?: string,
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
  },
): Promise<void> {}
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
    url: string;
  }[];
  cursor?: string;
  hasMore: boolean;
}> {}
```

### handleBlobUpload(options)

Handles the requests to generate a client token and respond to the upload completed event. This is useful when [uploading from browsers](#browser-upload) to circumvent the 4MB limitation of going through a Vercel-hosted route.

```ts
async function handleBlobUpload(options?: {
  token?: string; // default to process.env.BLOB_READ_WRITE_TOKEN
  request: IncomingMessage | Request;
  onBeforeGenerateToken: (pathname: string) => Promise<{
    allowedContentTypes?: string[]; // optional, defaults to no restriction
    maximumSizeInBytes?: number; // optional, defaults and maximum is 500MB (524,288,000 bytes)
    validUntil?: number; // optional, timestamp in ms, by default now + 30s
    metadata?: string;
  }>;
  onUploadCompleted: (body: {
    type: 'blob.upload-completed';
    payload: {
      blob: PutBlobResult;
      metadata?: string;
    };
  }) => Promise<void>;
  body:
    | {
        type: 'blob.upload-completed';
        payload: {
          blob: PutBlobResult;
          metadata?: string;
        };
      }
    | {
        type: 'blob.generate-client-token';
        payload: { pathname: string; callbackUrl: string };
      };
}): Promise<
  | { type: 'blob.generate-client-token'; clientToken: string }
  | { type: 'blob.upload-completed'; response: 'ok' }
> {}
```

Note: This method should be called server-side, not client-side.

### generateClientTokenFromReadWriteToken(options)

Generates a single-use token that can be used from within the client. This method is called internally by `handleBlobUpload`.

Once created, a client token is valid by default for 30 seconds (can be customized by configuring the `validUntil` field). This means you have 30 seconds to initiate an upload with this token.

```ts
async function generateClientTokenFromReadWriteToken(options?: {
  token?: string;
  pathname?: string;
  onUploadCompleted?: {
    callbackUrl: string;
    metadata?: string;
  };
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
  validUntil?: number; // timestamp in ms, by default 30s
}): string {}
```

Note: This is a server-side method.

## Examples

- [Next.js App Router examples](../../test/next/src/app/vercel/blob/)
- [https.get, axios, and got](../../test/next/src/app/vercel/blob/script.ts)

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

When transferring a file to a Serverless or Edge Functions route on Vercel, then the request body is limited to 4MB. If you need to send larger files then use the [browser-upload](#browser-upload) method.

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
