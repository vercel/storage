import type { Readable } from 'node:stream';
// eslint-disable-next-line unicorn/prefer-node-protocol -- node:crypto does not resolve correctly in browser and edge runtime
import * as crypto from 'crypto';
import type { BodyInit } from 'undici';
// When bundled via a bundler supporting the `browser` field, then
// the `undici` module will be replaced with https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
// for browser contexts. See ./undici-browser.js and ./package.json
import { fetch } from 'undici';

export interface BlobResult {
  url: string;
  size: string;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}
export class BlobError extends Error {
  constructor(message: string) {
    super(`Vercel Blob: ${message}`);
  }
}

export class BlobAccessError extends Error {
  constructor() {
    super(
      'Vercel Blob: Access denied, please provide a valid token for this resource',
    );
  }
}

export class BlobUnknownError extends Error {
  constructor() {
    super('Vercel Blob: Unknown error, please contact support@vercel.com');
  }
}

export interface ListBlobResult {
  blobs: BlobResult[];
  cursor?: string;
  hasMore: boolean;
}

export interface ListCommandOptions extends BlobCommandOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
}

export interface BlobCommandOptions {
  token?: string;
}

export interface PutCommandOptions extends BlobCommandOptions {
  access: 'public';
  contentType?: string;
}

export interface BlobUploadCompletedEvent {
  type: 'blob.upload-completed';
  payload: {
    blob: BlobResult;
    metadata?: string;
  };
}

export async function put(
  pathname: string,
  body:
    | string
    | Readable
    | Blob
    | ArrayBuffer
    | FormData
    | ReadableStream
    | File,
  options: PutCommandOptions,
): Promise<BlobResult> {
  if (!pathname) {
    throw new BlobError('pathname is required');
  }

  if (!body) {
    throw new BlobError('body is required');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!options || options.access !== 'public') {
    throw new BlobError('access must be "public"');
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${getToken(options)}`,
  };

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  const blobApiResponse = await fetch(`${getApiUrl()}/${pathname}`, {
    method: 'PUT',
    body: body as BodyInit,
    headers,
    // required in order to stream some body types to Cloudflare
    // currently only supported in Node.js, we may have to feature detect this
    duplex: 'half',
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const blobResult = (await blobApiResponse.json()) as BlobMetadataApi;
  return mapBlobResult(blobResult);
}

type BlobDelResult<T extends string | string[]> = T extends string
  ? BlobResult | null
  : (BlobResult | null)[];

export async function del<T extends string | string[]>(
  url: T,
  options?: BlobCommandOptions,
): Promise<BlobDelResult<T>> {
  const blobApiResponse = await fetch(`${getApiUrl()}/delete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${getToken(options)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ urls: Array.isArray(url) ? url : [url] }),
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const delResult =
    (await blobApiResponse.json()) as (BlobMetadataApi | null)[];

  if (Array.isArray(url)) {
    return delResult.map((deletedBlob) =>
      deletedBlob ? mapBlobResult(deletedBlob) : null,
    ) as BlobDelResult<T>;
  }
  if (delResult[0]) {
    return mapBlobResult(delResult[0]) as BlobDelResult<T>;
  }
  return null as BlobDelResult<T>;
}

interface BlobMetadataApi extends Omit<BlobResult, 'uploadedAt'> {
  uploadedAt: string;
}
interface ListBlobResultApi extends Omit<ListBlobResult, 'blobs'> {
  blobs: BlobMetadataApi[];
}

export async function head(
  url: string,
  options?: BlobCommandOptions,
): Promise<BlobResult | null> {
  const headApiUrl = new URL(getApiUrl());
  headApiUrl.searchParams.set('url', url);

  const blobApiResponse = await fetch(headApiUrl, {
    method: 'GET', // HEAD can't have body as a response, so we use GET
    headers: {
      authorization: `Bearer ${getToken(options)}`,
    },
  });

  if (blobApiResponse.status === 404) {
    return null;
  }

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const headResult = (await blobApiResponse.json()) as BlobMetadataApi;

  return mapBlobResult(headResult);
}

export async function list(
  options?: ListCommandOptions,
): Promise<ListBlobResult> {
  const listApiUrl = new URL(getApiUrl());
  if (options?.limit) {
    listApiUrl.searchParams.set('limit', options.limit.toString());
  }
  if (options?.prefix) {
    listApiUrl.searchParams.set('prefix', options.prefix);
  }
  if (options?.cursor) {
    listApiUrl.searchParams.set('cursor', options.cursor);
  }
  const blobApiResponse = await fetch(listApiUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${getToken(options)}`,
    },
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const results = (await blobApiResponse.json()) as ListBlobResultApi;

  return {
    ...results,
    blobs: results.blobs.map(mapBlobResult),
  };
}

export interface GenerateClientTokenOptions extends BlobCommandOptions {
  pathname: string;
  onUploadCompleted?: {
    callbackUrl: string;
    metadata?: string;
  };
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
  validUntil?: number;
}

export async function generateClientTokenFromReadWriteToken({
  token,
  ...args
}: GenerateClientTokenOptions): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new Error(
      '"generateClientTokenFromReadWriteToken" must be called from a server environment',
    );
  }
  const timestamp = new Date();
  timestamp.setSeconds(timestamp.getSeconds() + 30);
  const blobToken = getToken({ token });

  const [, , , storeId = null] = blobToken.split('_');

  if (!storeId) {
    throw new Error(
      token ? 'Invalid "token" parameter' : 'Invalid BLOB_READ_WRITE_TOKEN',
    );
  }

  const payload = Buffer.from(
    JSON.stringify({
      ...args,
      validUntil: args.validUntil ?? timestamp.getTime(),
    }),
  ).toString('base64');

  const securedKey = await signPayload(payload, blobToken);
  if (!securedKey) {
    throw new Error('Unable to sign client token');
  }
  return `vercel_blob_client_${storeId}_${Buffer.from(
    `${securedKey}.${payload}`,
  ).toString('base64')}`;
}

async function importKey(token?: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getToken({ token })),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signPayload(
  payload: string,
  token: string,
): Promise<string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!globalThis.crypto) {
    return crypto.createHmac('sha256', token).update(payload).digest('hex');
  }

  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    await importKey(token),
    new TextEncoder().encode(payload),
  );
  return Buffer.from(new Uint8Array(signature)).toString('hex');
}

export async function verifyCallbackSignature({
  token,
  signature,
  body,
}: {
  token?: string;
  signature: string;
  body: string;
}): Promise<boolean> {
  // callback signature is signed using the server token
  const secret = getToken({ token });
  // Browsers, Edge runtime and Node >=20 implement the Web Crypto API
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!globalThis.crypto) {
    // Node <20 falls back to the Node.js crypto module
    const digest = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    const digestBuffer = Buffer.from(digest);
    const signatureBuffer = Buffer.from(signature);

    return (
      digestBuffer.length === signatureBuffer.length &&
      crypto.timingSafeEqual(digestBuffer, signatureBuffer)
    );
  }
  const verified = await globalThis.crypto.subtle.verify(
    'HMAC',
    await importKey(token),
    hexToArrayByte(signature),
    new TextEncoder().encode(body),
  );
  return verified;
}

function hexToArrayByte(input: string): ArrayBuffer {
  if (input.length % 2 !== 0) {
    throw new RangeError('Expected string to be an even number of characters');
  }
  const view = new Uint8Array(input.length / 2);

  for (let i = 0; i < input.length; i += 2) {
    view[i / 2] = parseInt(input.substring(i, i + 2), 16);
  }

  return Buffer.from(view);
}

type DecodedClientTokenPayload = Omit<GenerateClientTokenOptions, 'token'> & {
  validUntil: number;
};

export function getPayloadFromClientToken(
  clientToken: string,
): DecodedClientTokenPayload {
  const [, , , , encodedToken] = clientToken.split('_');
  const encodedPayload = Buffer.from(encodedToken ?? '', 'base64')
    .toString()
    .split('.')[1];
  const decodedPayload = Buffer.from(encodedPayload ?? '', 'base64').toString();
  return JSON.parse(decodedPayload) as DecodedClientTokenPayload;
}

function getToken(options?: BlobCommandOptions): string {
  if (typeof window !== 'undefined') {
    if (!options?.token) {
      throw new BlobError('"token" is required');
    }
    if (!options.token.startsWith('vercel_blob_client')) {
      throw new BlobError('client upload only supports client tokens');
    }
  }
  if (options?.token) {
    return options.token;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN environment variable is not set. Please set it to your write token.',
    );
  }

  return process.env.BLOB_READ_WRITE_TOKEN;
}

function getApiUrl(): string {
  return (
    process.env.VERCEL_BLOB_API_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL ||
    'https://blob.vercel-storage.com'
  );
}

function mapBlobResult(blobResult: BlobMetadataApi): BlobResult {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}
