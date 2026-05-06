import { requestApi } from './api';
import {
  type BlobCommandOptions,
  BlobError,
  getApiUrl,
  type PresignedUrlPayload,
} from './helpers';
import {
  buildPresignCanonicalQueryEntries,
  PRESIGN_CANONICAL_QUERY_KEYS,
} from './presign-query-params';

/**
 * Operations that may be encoded in a delegation token (e.g. read: `get` / `head`,
 * write: `put` for presigned control-plane writes — both single-object `PUT`
 */
export type DelegationOperation = 'get' | 'head' | 'put';

/** Excluded from the string-to-sign; added after signing. @public for CDN / tooling alignment */
export const BLOB_PRESIGN_QUERY_DELEGATION = 'vercel-blob-delegation' as const;
/** @public for CDN / tooling alignment */
export const BLOB_PRESIGN_QUERY_SIGNATURE = 'vercel-blob-signature' as const;

/**
 * Maximum ms from request time until `validUntil` when the client supplies `validUntil`.
 * Matches the blob API `issue_signed_token` handler.
 */
export const SIGNED_TOKEN_MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Result of `issueSignedToken` — the same values returned from `POST /signed-token` on
 * the Blob API. Use with {@link presignUrl} to build a URL that can authorize GET/HEAD,
 * presigned `PUT`, presigned multipart `POST`, or presigned delete (`POST` to `/api/blob/delete`)
 * without a bearer token when verified by the CDN.
 */
export interface IssuedSignedToken {
  /**
   * Encodes delegation scope (pathname, allowed operations, expiry) and a store-level
   * HMAC, as issued by the API.
   */
  delegationToken: string;
  /**
   * Per-issuance HMAC key: `HMAC-SHA256(blobSigningSecret, delegationToken)` in base64url
   * form. The SDK uses this as the HMAC key when signing a concrete blob URL
   * (the CDN re-derives the same value from the delegation token and store secret).
   */
  clientSigningToken: string;
  /** Time after which the delegation (and any presigned URLs) must be rejected, in ms since epoch. */
  validUntil: number;
}

/**
 * Options for {@link issueSignedToken}.
 */
export type IssueSignedTokenOptions = BlobCommandOptions & {
  /**
   * Blob object pathname to scope the token to, e.g. `media/photo.png`.
   * Use `"*"` to allow any pathname in the store. When omitted, the API defaults
   * to a whole-store `"*"` wildcard.
   */
  pathname?: string;
  /**
   * Allowed operations (e.g. `get` / `head` for reads to `*.blob.vercel-storage.com`,
   * `put` for presigned control-plane `PUT` and multipart `POST /mpu`,
   * When omitted, the API defaults to read (`get`) only.
   */
  operations?: DelegationOperation[];
  /**
   * Absolute delegation expiry (ms since epoch). Must be after `now` and at most
   * `now + {@link SIGNED_TOKEN_MAX_DURATION_MS}`. When omitted, the API uses `now + 1 hour`.
   */
  validUntil?: number;

  allowedContentTypes?: string[];

  maximumSizeInBytes?: number;
};

interface IssuedSignedTokenResponse {
  delegationToken: string;
  clientSigningToken: string;
  validUntil: number;
}

function assertIssueSignedTokenValidUntilOption(validUntil: number): void {
  const now = Date.now();
  if (
    typeof validUntil !== 'number' ||
    !Number.isInteger(validUntil) ||
    !Number.isFinite(validUntil)
  ) {
    throw new BlobError(
      '`issueSignedToken`: validUntil must be an integer milliseconds timestamp.',
    );
  }
  if (validUntil <= now) {
    throw new BlobError(
      '`issueSignedToken`: validUntil must be in the future.',
    );
  }
  const maxUntil = now + SIGNED_TOKEN_MAX_DURATION_MS;
  if (validUntil > maxUntil) {
    throw new BlobError(
      '`issueSignedToken`: validUntil cannot be more than 7 days after the current time.',
    );
  }
}

/**
 * Requests short-lived signed-token material from the Blob control API
 * (`POST /signed-token`). Use OIDC (`VERCEL_OIDC_TOKEN` + `storeId` / `BLOB_STORE_ID`)
 * or a read–write token like other SDK control-plane calls. Client (browser) tokens
 * are not allowed by the server for this operation.
 *
 * JSON body fields supported by the API (delegation payload / `issue_signed_token`):
 * `pathname`, `operations`, `validUntil`, `maximumSizeInBytes`, `allowedContentTypes`.
 * Optional `maximumSizeInBytes` and `allowedContentTypes` narrow upload scope in the
 * delegation token. Everything else for presigned writes (`addRandomSuffix`, `ifMatch`,
 * `onUploadCompleted`, shorter `validUntil`, …) is **URL query only** — use
 * {@link presignUrl} / {@link PresignUrlOptions} (see `BLOB_PRESIGN_QUERY_*` in
 * `./presign-query-params`).
 */
export async function issueSignedToken(
  options: IssueSignedTokenOptions,
): Promise<IssuedSignedToken> {
  if (!options) {
    throw new BlobError('`issueSignedToken` requires an options object');
  }

  const body: Record<string, unknown> = {};
  if (options.pathname !== undefined) {
    body.pathname = options.pathname;
  }
  if (options.operations !== undefined) {
    if (options.operations.length === 0) {
      throw new BlobError('`operations` must be a non-empty array if provided');
    }
    body.operations = dedupeOps(options.operations);
  }
  if (options.validUntil !== undefined) {
    assertIssueSignedTokenValidUntilOption(options.validUntil);
    body.validUntil = options.validUntil;
  }
  if (options.maximumSizeInBytes !== undefined) {
    body.maximumSizeInBytes = options.maximumSizeInBytes;
  }
  if (options.allowedContentTypes !== undefined) {
    body.allowedContentTypes = options.allowedContentTypes;
  }

  return requestApi<IssuedSignedTokenResponse>(
    '/signed-token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    },
    options,
  );
}

function dedupeOps(
  operations: readonly DelegationOperation[],
): DelegationOperation[] {
  return Array.from(new Set(operations));
}

interface DecodedDelegationPayload {
  storeId: string;
  ownerId: string;
  pathname: string;
  operations: string[];
  validUntil: number;
  iat: number;
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
}

function base64UrlDecodeToString(segment: string): string {
  let base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = 4 - (base64.length % 4);
  if (padding !== 4) {
    base64 += '='.repeat(padding);
  }
  if (typeof atob === 'function') {
    return atob(base64);
  }
  if (typeof Buffer !== 'undefined') {
    // eslint-disable-next-line no-restricted-globals
    return Buffer.from(base64, 'base64').toString('utf8');
  }
  throw new BlobError('Cannot decode base64: no atob or Buffer available.');
}

function tryDecodePayload(
  delegationToken: string,
): DecodedDelegationPayload | null {
  const dot = delegationToken.indexOf('.');
  if (dot < 0) {
    return null;
  }
  const payloadSeg = delegationToken.slice(0, dot);
  try {
    return JSON.parse(
      base64UrlDecodeToString(payloadSeg),
    ) as DecodedDelegationPayload;
  } catch {
    return null;
  }
}

/**
 * Builds a blob object URL for `pathname` and store from `delegationToken` for use with
 * {@link presignUrl} for `GET` / `HEAD` only (to `*.public|*.private.blob.vercel-storage.com`).
 */
export function publicBlobObjectUrl(
  access: 'public' | 'private',
  objectPathname: string,
  delegationToken: string,
): string {
  const scope = tryDecodePayload(delegationToken);
  if (!scope) {
    throw new BlobError('Invalid or unreadable `delegationToken` payload.');
  }
  const storeId = normalizeStoreId(scope.storeId);
  const encodedPath = objectPathname
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${storeId}.${access}.blob.vercel-storage.com/${encodedPath}`;
}

/**
 * @internal
 */
function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    // eslint-disable-next-line no-restricted-globals
    return Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).toString('base64');
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return btoa(s);
}

/**
 * HMAC-SHA256 with the `clientSigningToken` string as the UTF-8 key; signature
 * digest is base64url (no padding), i.e. `vercel-blob-signature`.
 * Uses the Web Crypto API (Node 20+, browsers, Edge).
 */
async function hmacSha256Base64Url(key: string, data: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new BlobError(
      'HMAC is not available: expected globalThis.crypto.subtle (Node 20+ or a modern browser).',
    );
  }
  const enc = new TextEncoder();
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await globalThis.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    enc.encode(data),
  );
  return toBase64Url(uint8ToBase64(new Uint8Array(buf)));
}

/**
 * @internal
 */
function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function normalizeStoreId(storeId: string): string {
  const lowercase = storeId.toLowerCase();
  return lowercase.startsWith('store_')
    ? lowercase.slice('store_'.length)
    : lowercase;
}

/**
 * Presign URL options for {@link presignUrl} when `operation` is `get`, `head`, or `delete`.
 * Only `validUntil` is honored for these operations; upload-only fields are rejected at the type level.
 */
export type PresignSimpleUrlOptions = {
  /**
   * Absolute URL expiry (ms since epoch), capped to the delegation `validUntil`.
   * Omitted on the wire when equal to the delegation ceiling (server defaults to delegation).
   */
  validUntil?: number;
};

/**
 * Presign URL options for {@link presignUrl} when `operation` is `put` (single `PUT` or multipart `POST`).
 * Serialized as individual `vercel-blob-*` query params (see {@link PRESIGN_CANONICAL_QUERY_KEYS}).
 */
export type PresignPutUrlOptions = PresignSimpleUrlOptions & {
  allowedContentTypes?: string[];

  maximumSizeInBytes?: number;

  onUploadCompleted?: {
    callbackUrl: string;
    tokenPayload?: string | null;
  };

  allowOverwrite?: boolean;

  addRandomSuffix?: boolean;

  cacheControlMaxAge?: number;

  ifMatch?: string;
};

/**
 * Optional settings for {@link presignUrl}, narrowed by `operation`.
 */
export type PresignUrlOptions<
  TOperation extends DelegationOperation = DelegationOperation,
> = TOperation extends 'put' ? PresignPutUrlOptions : PresignSimpleUrlOptions;

/**
 * Builds the payload for a presigned URL
 */
export async function presignUrl<TOperation extends DelegationOperation>(
  pathname: string,
  signedToken: Pick<
    IssuedSignedToken,
    'clientSigningToken' | 'delegationToken'
  >,
  operation: TOperation,
  options?: PresignUrlOptions<TOperation>,
): Promise<PresignedUrlPayload> {
  if (!signedToken?.clientSigningToken || !signedToken?.delegationToken) {
    throw new BlobError(
      '`clientSigningToken` and `delegationToken` from `issueSignedToken` are required.',
    );
  }

  const scope = tryDecodePayload(signedToken.delegationToken);
  if (!scope) {
    throw new BlobError('Invalid or unreadable `delegationToken` payload.');
  }

  const p = scope.pathname;
  if (p && p !== '*') {
    if (pathname !== p) {
      throw new BlobError(
        `Blob path does not match the signed token scope; expected \`${p}\`, got \`${pathname}\`.`,
      );
    }
  }
  if (Number.isFinite(scope.validUntil) && Date.now() > scope.validUntil) {
    throw new BlobError(
      'The signed delegation has expired; issue a new token first.',
    );
  }

  if (operation === 'head' && !scope.operations?.includes('head')) {
    throw new BlobError(
      'The delegation token is not valid for `HEAD` requests. Include `"head"` in `operations` when calling `issueSignedToken`.',
    );
  }
  if (operation === 'get' && !scope.operations?.includes('get')) {
    throw new BlobError(
      'The delegation token is not valid for `GET` requests. Include `"get"` in `operations` when calling `issueSignedToken`.',
    );
  }
  if (operation === 'put' && !scope.operations?.includes('put')) {
    throw new BlobError(
      'The delegation token is not valid for presigned write requests. Include `"put"` in `operations` when calling `issueSignedToken`.',
    );
  }

  const delegationForOptions = {
    validUntil: scope.validUntil,
    maximumSizeInBytes: scope.maximumSizeInBytes,
    allowedContentTypes: scope.allowedContentTypes,
  };

  let presignEntries: [string, string][];
  try {
    presignEntries = buildPresignCanonicalQueryEntries({
      operation,
      delegation: delegationForOptions,
      urlOptions: options,
      nowMs: Date.now(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new BlobError(msg);
  }

  const canonical = canonicalString(pathname, presignEntries, operation);
  const signature = await hmacSha256Base64Url(
    signedToken.clientSigningToken,
    canonical,
  );

  return {
    delegationToken: signedToken.delegationToken,
    signature,
    options: Object.fromEntries(presignEntries),
  };
}

/** @internal Exported for presign URL contract tests (must match proxy / api-blob). */
export function canonicalString(
  pathname: string,
  presignEntries: [string, string][],
  operation: DelegationOperation,
): string {
  const lines: string[] = [`operation=${operation}`, `pathname=${pathname}`];
  for (const k of PRESIGN_CANONICAL_QUERY_KEYS) {
    const v = presignEntries.find(([key]) => key === k)?.[1];
    if (v) {
      lines.push(`${k}=${v}`);
    }
  }
  lines.sort((a, b) => compareUtf8(a, b));
  return lines.join('\n');
}

const utf8Encoder = new TextEncoder();

/**
 * Lexicographic order of UTF-8 bytewise (matches Go `string` comparison and
 * `url.Values` key / pair ordering in practice).
 * @internal
 */
function compareUtf8(a: string, b: string): number {
  const ab = utf8Encoder.encode(a);
  const bb = utf8Encoder.encode(b);
  const n = Math.min(ab.length, bb.length);
  for (let i = 0; i < n; i++) {
    const d = (ab[i]! - bb[i]!) as number;
    if (d !== 0) {
      return d;
    }
  }
  return ab.length - bb.length;
}
