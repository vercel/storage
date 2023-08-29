// eslint-disable-next-line unicorn/prefer-node-protocol -- node:crypto does not resolve correctly in browser and edge runtime
import * as crypto from 'crypto';
import type { IncomingMessage } from 'node:http';
import { getToken } from './helpers';
import { type HeadBlobResult, type BlobCommandOptions } from '.';

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
}

export async function generateClientTokenFromReadWriteToken({
  token,
  ...args
}: GenerateClientTokenOptions): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new Error(
      '"generateClientTokenFromReadWriteToken" must be called from a server environment'
    );
  }
  const timestamp = new Date();
  timestamp.setSeconds(timestamp.getSeconds() + 30);
  const blobToken = getToken({ token });

  const [, , , storeId = null] = blobToken.split('_');

  if (!storeId) {
    throw new Error(
      token ? 'Invalid "token" parameter' : 'Invalid BLOB_READ_WRITE_TOKEN'
    );
  }

  const payload = Buffer.from(
    JSON.stringify({
      ...args,
      validUntil: args.validUntil ?? timestamp.getTime(),
    })
  ).toString('base64');

  const securedKey = await signPayload(payload, blobToken);
  if (!securedKey) {
    throw new Error('Unable to sign client token');
  }
  return `vercel_blob_client_${storeId}_${Buffer.from(
    `${securedKey}.${payload}`
  ).toString('base64')}`;
}

async function importKey(token?: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getToken({ token })),
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
  const secret = getToken({ token });
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
export interface BlobUploadCompletedEvent {
  type: (typeof EventTypes)['uploadCompleted'];
  payload: {
    blob: HeadBlobResult;
    metadata?: string;
  };
}

export type HandleBlobUploadBody =
  | GenerateClientTokenEvent
  | BlobUploadCompletedEvent;

type RequestType = IncomingMessage | Request;
export interface HandleBlobUploadOptions {
  body: HandleBlobUploadBody;
  onBeforeGenerateToken: (
    pathname: string
  ) => Promise<
    Pick<
      GenerateClientTokenOptions,
      | 'allowedContentTypes'
      | 'maximumSizeInBytes'
      | 'validUntil'
      | 'addRandomSuffix'
    > & { metadata?: string }
  >;
  onUploadCompleted: (
    body: BlobUploadCompletedEvent['payload']
  ) => Promise<void>;
  token?: string;
  request: RequestType;
}

export async function handleBlobUpload({
  token,
  request,
  body,
  onBeforeGenerateToken,
  onUploadCompleted,
}: HandleBlobUploadOptions): Promise<
  | { type: GenerateClientTokenEvent['type']; clientToken: string }
  | { type: BlobUploadCompletedEvent['type']; response: 'ok' }
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
        throw new Error('Invalid callback signature');
      }
      const isVerified = await verifyCallbackSignature({
        signature,
        body: JSON.stringify(body),
      });
      if (!isVerified) {
        throw new Error('Invalid callback signature');
      }
      await onUploadCompleted(body.payload);
      return { type, response: 'ok' };
    }
    default:
      throw new Error('Invalid event type');
  }
}
