// eslint-disable-next-line unicorn/prefer-node-protocol -- node:crypto does not resolve correctly in browser and edge runtime
import * as crypto from 'crypto';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';
import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import type { BlobCommandOptions, PutBlobApiResponse } from './helpers';
import {
  BlobAccessError,
  BlobError,
  BlobUnknownError,
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
} from './helpers';
import type { PutBlobResult, HeadBlobResult } from '.';

// upload()
// This is a client-side wrapper that will fetch the client token for you and then upload the file
export interface UploadOptions extends BlobCommandOptions {
  access: 'public';
  contentType?: string;
  handleUploadUrl: string;
}

export async function upload(
  pathname: string,
  body:
    | string
    | Readable
    | Blob
    | ArrayBuffer
    | FormData
    | ReadableStream
    | File,
  options: UploadOptions
): Promise<PutBlobResult> {
  if (typeof window === 'undefined') {
    throw new BlobError('`upload` must be called from a client environment');
  }

  if (!pathname) {
    throw new BlobError('pathname is required');
  }

  if (!body) {
    throw new BlobError('body is required');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX. options are required in Types, but at runtime someone not using Typescript could forget them.
  if (!options) {
    throw new BlobError('Missing parameters, see usage');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
  if (options.access !== 'public') {
    throw new BlobError('`access` must be "public"');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
  if (options.handleUploadUrl === undefined) {
    throw new BlobError('Missing `handleUploadUrl` parameter');
  }

  if (
    // @ts-expect-error -- Runtime check for DX.
    options.addRandomSuffix !== undefined ||
    // @ts-expect-error -- Runtime check for DX.
    options.cacheControlMaxAge !== undefined
  ) {
    throw new BlobError(
      'addRandomSuffix and cacheControlMaxAge are not supported in client uploads. Configure these options at the server side when generating client tokens.'
    );
  }

  const clientToken = await retrieveClientToken({
    handleUploadUrl: options.handleUploadUrl,
    pathname,
  });

  const headers: Record<string, string> = {
    ...getApiVersionHeader(),
    authorization: `Bearer ${clientToken}`,
  };

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  const blobApiResponse = await fetch(getApiUrl(`/${pathname}`), {
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

  const blobResult = (await blobApiResponse.json()) as PutBlobApiResponse;

  return blobResult;
}

async function importKey(token?: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getTokenFromOptionsOrEnv({ token })),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signPayload(
  payload: string,
  token: string
): Promise<string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Node.js < 20: globalThis.crypto is undefined (in a real script.js, because the REPL has it linked to the crypto module). Node.js >= 20, Browsers and Cloudflare workers: globalThis.crypto is defined and is the Web Crypto API.
  if (!globalThis.crypto) {
    return crypto.createHmac('sha256', token).update(payload).digest('hex');
  }

  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    await importKey(token),
    new TextEncoder().encode(payload)
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
  const secret = getTokenFromOptionsOrEnv({ token });
  // Browsers, Edge runtime and Node >=20 implement the Web Crypto API
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Node.js < 20: globalThis.crypto is undefined (in a real script.js, because the REPL has it linked to the crypto module). Node.js >= 20, Browsers and Cloudflare workers: globalThis.crypto is defined and is the Web Crypto API.
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
    new TextEncoder().encode(body)
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
  clientToken: string
): DecodedClientTokenPayload {
  const [, , , , encodedToken] = clientToken.split('_');
  const encodedPayload = Buffer.from(encodedToken ?? '', 'base64')
    .toString()
    .split('.')[1];
  const decodedPayload = Buffer.from(encodedPayload ?? '', 'base64').toString();
  return JSON.parse(decodedPayload) as DecodedClientTokenPayload;
}

export const EventTypes = {
  generateClientToken: 'blob.generate-client-token',
  uploadCompleted: 'blob.upload-completed',
} as const;

export interface GenerateClientTokenEvent {
  type: (typeof EventTypes)['generateClientToken'];
  payload: { pathname: string; callbackUrl: string };
}
export interface UploadCompletedEvent {
  type: (typeof EventTypes)['uploadCompleted'];
  payload: {
    // TODO @Fabio: is this correct? I guess it should be a PutBlobResult and not HeadBlobResult unless
    // we're doing an extra head() call somewhere?
    blob: HeadBlobResult;
    metadata?: string;
  };
}

export type HandleUploadBody = GenerateClientTokenEvent | UploadCompletedEvent;

type RequestType = IncomingMessage | Request;
export interface HandleUploadOptions {
  body: HandleUploadBody;
  onBeforeGenerateToken: (
    pathname: string
  ) => Promise<
    Pick<
      GenerateClientTokenOptions,
      | 'allowedContentTypes'
      | 'maximumSizeInBytes'
      | 'validUntil'
      | 'addRandomSuffix'
      | 'cacheControlMaxAge'
    > & { metadata?: string }
  >;
  onUploadCompleted: (body: UploadCompletedEvent['payload']) => Promise<void>;
  token?: string;
  request: RequestType;
}

export async function handleUpload({
  token,
  request,
  body,
  onBeforeGenerateToken,
  onUploadCompleted,
}: HandleUploadOptions): Promise<
  | { type: GenerateClientTokenEvent['type']; clientToken: string }
  | { type: UploadCompletedEvent['type']; response: 'ok' }
> {
  const type = body.type;
  switch (type) {
    case 'blob.generate-client-token': {
      const { pathname, callbackUrl } = body.payload;
      const payload = await onBeforeGenerateToken(pathname);
      return {
        type,
        clientToken: await generateClientTokenFromReadWriteToken({
          ...payload,
          token,
          pathname,
          onUploadCompleted: {
            callbackUrl,
            metadata: payload.metadata ?? null,
          },
        }),
      };
    }
    case 'blob.upload-completed': {
      const signatureHeader = 'x-vercel-signature';
      const signature = (
        'credentials' in request
          ? request.headers.get(signatureHeader) ?? ''
          : request.headers[signatureHeader] ?? ''
      ) as string;
      if (!signature) {
        throw new BlobError('Invalid callback signature');
      }
      const isVerified = await verifyCallbackSignature({
        signature,
        body: JSON.stringify(body),
      });
      if (!isVerified) {
        throw new BlobError('Invalid callback signature');
      }
      await onUploadCompleted(body.payload);
      return { type, response: 'ok' };
    }
    default:
      throw new BlobError('Invalid event type');
  }
}

async function retrieveClientToken(options: {
  pathname: string;
  handleUploadUrl: string;
}): Promise<string> {
  const { handleUploadUrl, pathname } = options;
  const url = isAbsoluteUrl(handleUploadUrl)
    ? handleUploadUrl
    : `${window.location.origin}${handleUploadUrl}`;

  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      type: EventTypes.generateClientToken,
      payload: { pathname, callbackUrl: url },
    } as GenerateClientTokenEvent),
  });
  if (!res.ok) {
    throw new BlobError('Failed to  retrieve the client token');
  }
  try {
    const { clientToken } = (await res.json()) as { clientToken: string };
    return clientToken;
  } catch (e) {
    throw new BlobError('Failed to retrieve the client token');
  }
}

function isAbsoluteUrl(url: string): boolean {
  try {
    return Boolean(new URL(url));
  } catch (e) {
    return false;
  }
}

export async function generateClientTokenFromReadWriteToken({
  token,
  ...argsWithoutToken
}: GenerateClientTokenOptions): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new BlobError(
      '"generateClientTokenFromReadWriteToken" must be called from a server environment'
    );
  }

  const timestamp = new Date();
  timestamp.setSeconds(timestamp.getSeconds() + 30);
  const readWriteToken = getTokenFromOptionsOrEnv({ token });

  const [, , , storeId = null] = readWriteToken.split('_');

  if (!storeId) {
    throw new BlobError(
      token ? 'Invalid `token` parameter' : 'Invalid `BLOB_READ_WRITE_TOKEN`'
    );
  }

  const payload = Buffer.from(
    JSON.stringify({
      ...argsWithoutToken,
      validUntil: argsWithoutToken.validUntil ?? timestamp.getTime(),
    })
  ).toString('base64');

  const securedKey = await signPayload(payload, readWriteToken);
  if (!securedKey) {
    throw new BlobError('Unable to sign client token');
  }
  return `vercel_blob_client_${storeId}_${Buffer.from(
    `${securedKey}.${payload}`
  ).toString('base64')}`;
}

export interface GenerateClientTokenOptions extends BlobCommandOptions {
  pathname: string;
  onUploadCompleted?: {
    callbackUrl: string;
    metadata?: string | null;
  };
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
  validUntil?: number;
  addRandomSuffix?: boolean;
  cacheControlMaxAge?: number;
}
