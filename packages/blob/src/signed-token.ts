import { requestApi } from './api';
import { type BlobCommandOptions, BlobError, getApiUrl } from './helpers';
import {
  buildPresignCanonicalQueryEntries,
  deletePresignCanonicalParams,
  PRESIGN_CANONICAL_QUERY_KEYS,
  type PresignOptionsOnUploadCompletedWire,
} from './presign-query-params';

/**
 * Operations that may be encoded in a delegation token (e.g. read: `get` / `head`,
 * write: `upload` for presigned control-plane writes — both single-object `PUT`
 * ({@link controlPlaneBlobPutUrl}) and multipart `POST` ({@link controlPlaneBlobMpuUrl}),
 * destructive: `delete` for presigned `DELETE` against the blob object URL).
 */
export type DelegationOperation = 'get' | 'head' | 'upload' | 'delete';

/** Excluded from the string-to-sign; added after signing. @public for CDN / tooling alignment */
export const BLOB_PRESIGN_QUERY_DELEGATION = 'vercel-blob-delegation' as const;
/** @public for CDN / tooling alignment */
export const BLOB_PRESIGN_QUERY_SIGNATURE = 'vercel-blob-signature' as const;

/**
 * Min/max TTL the API allows for signed tokens (seconds). Matches the blob API
 * `issue_signed_token` handler.
 */
export const SIGNED_TOKEN_MIN_TTL_SECONDS = 60 * 60;
export const SIGNED_TOKEN_MAX_TTL_SECONDS = 24 * 60 * 60;

/**
 * Result of `issueSignedToken` — the same values returned from `POST /signed-token` on
 * the Blob API. Use with {@link presignUrl} to build a URL that can authorize GET/HEAD,
 * presigned `PUT`, or presigned multipart `POST` without a bearer token when verified by the CDN.
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
   * `upload` for presigned control-plane `PUT` and multipart `POST /mpu`,
   * `delete` for presigned `DELETE` against `*.blob.vercel-storage.com`).
   * When omitted, the API defaults to read (`get`) only.
   */
  operations?: DelegationOperation[];
  /**
   * Time-to-live in seconds, between {@link SIGNED_TOKEN_MIN_TTL_SECONDS} and
   * {@link SIGNED_TOKEN_MAX_TTL_SECONDS}. When omitted, the API uses the minimum (1h).
   */
  ttlSeconds?: number;

  allowedContentTypes?: string[];

  maximumSizeInBytes?: number;
};

interface IssuedSignedTokenResponse {
  delegationToken: string;
  clientSigningToken: string;
  validUntil: number;
}

/**
 * Requests short-lived signed-token material from the Blob control API
 * (`POST /signed-token`). Use OIDC (`VERCEL_OIDC_TOKEN` + `storeId` / `BLOB_STORE_ID`)
 * or a read–write token like other SDK control-plane calls. Client (browser) tokens
 * are not allowed by the server for this operation.
 *
 * JSON body fields supported by the API (delegation payload / `issue_signed_token`):
 * `pathname`, `operations`, `ttlSeconds`, `maximumSizeInBytes`, `allowedContentTypes`.
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

  // if (options.ifMatch && options.allowOverwrite === false) {
  //   throw new BlobError(
  //     'ifMatch and allowOverwrite: false are contradictory. ifMatch is used for conditional overwrites, which requires allowOverwrite to be true.',
  //   );
  // }

  // let effectiveAllowOverwrite = options.allowOverwrite;
  // if (options.ifMatch && effectiveAllowOverwrite === undefined) {
  //   effectiveAllowOverwrite = true;
  // }

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
  if (options.ttlSeconds !== undefined) {
    body.ttlSeconds = options.ttlSeconds;
  }
  if (options.maximumSizeInBytes !== undefined) {
    body.maximumSizeInBytes = options.maximumSizeInBytes;
  }
  if (options.allowedContentTypes !== undefined) {
    body.allowedContentTypes = options.allowedContentTypes;
  }
  // if (options.validUntil !== undefined) {
  //   body.validUntil = options.validUntil;
  // }
  // if (options.addRandomSuffix !== undefined) {
  //   body.addRandomSuffix = options.addRandomSuffix;
  // }
  // if (effectiveAllowOverwrite !== undefined) {
  //   body.allowOverwrite = effectiveAllowOverwrite;
  // }
  // if (options.cacheControlMaxAge !== undefined) {
  //   body.cacheControlMaxAge = options.cacheControlMaxAge;
  // }
  // if (options.ifMatch !== undefined) {
  //   body.ifMatch = options.ifMatch;
  // }
  // if (options.onUploadCompleted !== undefined) {
  //   body.onUploadCompleted = {
  //     callbackUrl: options.onUploadCompleted.callbackUrl,
  //     tokenPayload: options.onUploadCompleted.tokenPayload ?? undefined,
  //   };
  // }

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
 * For `PUT` / presigned single uploads, use {@link controlPlaneBlobPutUrl}.
 * For multipart presigned `POST` requests, use {@link controlPlaneBlobMpuUrl}.
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
 * The same `PUT` target as `put()` and client uploads: `?pathname=…` on the
 * blob control API (respects `VERCEL_BLOB_API_URL` / `NEXT_PUBLIC_VERCEL_BLOB_API_URL`).
 * Use with {@link presignUrl} and `method: 'PUT'`.
 */
export function controlPlaneBlobPutUrl(objectPathname: string): string {
  const params = new URLSearchParams({ pathname: objectPathname });
  return getApiUrl(`/?${params.toString()}`);
}

/**
 * Multipart control-plane base URL: `POST /mpu?pathname=…` on the blob API
 * (same shape as the SDK’s multipart create call). Use with {@link presignUrl}
 * and `method: 'POST'`.
 */
export function controlPlaneBlobMpuUrl(objectPathname: string): string {
  const params = new URLSearchParams({ pathname: objectPathname });
  return getApiUrl(`/mpu?${params.toString()}`);
}

/**
 * @internal
 */
function isBlobObjectHostName(hostname: string): boolean {
  return (
    hostname.endsWith('.public.blob.vercel-storage.com') ||
    hostname.endsWith('.private.blob.vercel-storage.com')
  );
}

/**
 * @internal
 */
function assertControlPlaneApiUrl(u: URL): void {
  const ref = new URL(getApiUrl(''));
  if (u.origin !== ref.origin) {
    throw new BlobError(
      'PUT presign URL must use the same origin as the blob control API (see `getApiUrl` / `controlPlaneBlobPutUrl`).',
    );
  }
  const a = u.pathname.replace(/\/$/, '') || '/';
  const b = ref.pathname.replace(/\/$/, '') || '/';
  if (a !== b) {
    throw new BlobError(
      'PUT presign URL must target the blob API path, like `put()` (e.g. `/api/blob/`), not the blob object host.',
    );
  }
  if (u.searchParams.get('pathname') == null) {
    throw new BlobError(
      'The blob API `PUT` URL must include a `pathname` query, like `controlPlaneBlobPutUrl`.',
    );
  }
}

/**
 * @internal
 */
function assertControlPlaneMpuApiUrl(u: URL): void {
  const ref = new URL(getApiUrl(''));
  if (u.origin !== ref.origin) {
    throw new BlobError(
      'POST MPU presign URL must use the same origin as the blob control API (see `getApiUrl` / `controlPlaneBlobMpuUrl`).',
    );
  }
  const normalize = (p: string) => p.replace(/\/$/, '') || '/';
  const refBase = normalize(ref.pathname);
  const expectedMpuPath = refBase === '/' ? '/mpu' : `${refBase}/mpu`;
  if (normalize(u.pathname) !== normalize(expectedMpuPath)) {
    throw new BlobError(
      `POST MPU presign URL must target the blob API \`/mpu\` path (expected \`${expectedMpuPath}\`, got \`${u.pathname}\`).`,
    );
  }
  if (
    u.searchParams.get('pathname') == null ||
    u.searchParams.get('pathname') === ''
  ) {
    throw new BlobError(
      'The MPU URL must include a non-empty `pathname` query, like `controlPlaneBlobMpuUrl`.',
    );
  }
}

/**
 * @internal
 */
function assertBlobHost(hostname: string): { storeId: string } {
  if (!isBlobObjectHostName(hostname)) {
    throw new BlobError(
      'The URL must use a Vercel Blob host (*.public|*.private.blob.vercel-storage.com), or use `controlPlaneBlobPutUrl` for `PUT` presigns.',
    );
  }
  const isPublic = hostname.endsWith('.public.blob.vercel-storage.com');
  const sub = isPublic
    ? hostname.slice(0, -'.public.blob.vercel-storage.com'.length)
    : hostname.slice(0, -'.private.blob.vercel-storage.com'.length);
  if (!sub) {
    throw new BlobError('Could not read store id from the blob host.');
  }
  return { storeId: sub };
}

/**
 * @internal
 */
function objectPathnameFromUrl(url: URL): string {
  // pathname is e.g. /my/file.png → "my/file.png" (no leading slash)
  return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
}

/**
 * `URL#pathname` is often percent-encoded per segment; `issueSignedToken` scope
 * `pathname` is the logical key (e.g. spaces, parens as Unicode). Compare after
 * decoding each segment.
 */
function decodeBlobObjectPath(path: string): string {
  if (!path) {
    return path;
  }
  return path
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
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
 * Optional settings for {@link presignUrl}.
 * Serialized as individual `vercel-blob-*` query params (see {@link PRESIGN_CANONICAL_QUERY_KEYS}).
 */
export type PresignUrlOptions = {
  /**
   * Absolute URL expiry (ms since epoch), capped to the delegation `validUntil`.
   * Omitted on the wire when equal to the delegation ceiling (server defaults to delegation).
   */
  validUntil?: number;

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
 * Builds a **presigned URL** (read: `GET` / `HEAD` to `publicBlobObjectUrl`, or write:
 * `PUT` to {@link controlPlaneBlobPutUrl}, or multipart `POST` to {@link controlPlaneBlobMpuUrl},
 * or destructive: `DELETE` to `publicBlobObjectUrl`)
 * by HMACing a canonical string with `clientSigningToken` and appending the delegation
 * and signature as query parameters. The CDN re-derives the signing key from
 * `delegationToken` and validates the HMAC, scope, and expiry.
 *
 * **Canonical string** (must match the verification service on the edge/Go; no
 * host or scheme in the sign input):
 *
 * Sorted newline-separated `key=value` pairs (UTF-8 byte order of whole lines):
 *
 * - `operation=get`, `operation=head`, `operation=upload`, or `operation=delete`
 *   (implicit from URL target: object host + GET/HEAD/DELETE vs control-plane
 *   PUT/POST for uploads).
 * - `pathname=<object key>`: from the URL path (reads / deletes) or the
 *   `pathname` query (control-plane `PUT` / `POST` uploads).
 * - Optional `vercel-blob-*` constraint params (see `@vercel/blob` / proxy): each present
 *   param becomes one `key=value` line. URL expiry uses optional
 *   `vercel-blob-valid-until` (ms); when omitted, the server treats the URL as expiring
 *   with the delegation. Callback wiring uses `vercel-blob-callback-url` and optional
 *   `vercel-blob-callback-token-payload`.
 *
 * Delegation and signature are **appended to the final URL** after the HMAC is computed.
 */
export async function presignUrl(
  blobUrl: string,
  issued: Pick<IssuedSignedToken, 'clientSigningToken' | 'delegationToken'>,
  operation: DelegationOperation = 'get',
  options?: PresignUrlOptions,
): Promise<string> {
  if (!blobUrl) {
    throw new BlobError('A blob URL is required.');
  }
  if (!issued?.clientSigningToken || !issued?.delegationToken) {
    throw new BlobError(
      '`clientSigningToken` and `delegationToken` from `issueSignedToken` are required.',
    );
  }

  const url = new URL(blobUrl);
  url.searchParams.delete(BLOB_PRESIGN_QUERY_DELEGATION);
  url.searchParams.delete(BLOB_PRESIGN_QUERY_SIGNATURE);
  deletePresignCanonicalParams(url);

  const scope = tryDecodePayload(issued.delegationToken);
  if (!scope) {
    throw new BlobError('Invalid or unreadable `delegationToken` payload.');
  }

  let opPath: string;
  if (operation === 'upload') {
    if (isBlobObjectHostName(url.hostname)) {
      throw new BlobError(
        'upload presigning must use the control-plane URL from `controlPlaneBlobPutUrl` or `controlPlaneBlobMpuUrl`, not a `*.blob.vercel-storage.com` object URL (use `publicBlobObjectUrl` for GET/HEAD).',
      );
    }

    const fromQuery = url.searchParams.get('pathname');
    if (fromQuery === null || fromQuery === '') {
      throw new BlobError(
        'The `upload` URL must include a non-empty `pathname` query.',
      );
    }
    opPath = decodeBlobObjectPath(fromQuery);
  } else {
    const { storeId: hostStoreId } = assertBlobHost(url.hostname);
    if (normalizeStoreId(scope.storeId) !== normalizeStoreId(hostStoreId)) {
      throw new BlobError(
        'Store id in the URL does not match the delegation token.',
      );
    }
    opPath = decodeBlobObjectPath(objectPathnameFromUrl(url));
  }
  const p = scope.pathname;
  if (p && p !== '*') {
    const pNorm = decodeBlobObjectPath(p);
    if (opPath !== pNorm) {
      throw new BlobError(
        'Blob path does not match the signed token scope; expected `' +
          p +
          '`, got `' +
          opPath +
          '`.',
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
  if (operation === 'upload' && !scope.operations?.includes('upload')) {
    throw new BlobError(
      'The delegation token is not valid for presigned write requests. Include `"upload"` in `operations` when calling `issueSignedToken`.',
    );
  }
  if (operation === 'delete' && !scope.operations?.includes('delete')) {
    throw new BlobError(
      'The delegation token is not valid for `DELETE` requests. Include `"delete"` in `operations` when calling `issueSignedToken`.',
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
  for (const [k, v] of presignEntries) {
    url.searchParams.set(k, v);
  }

  const canonical = canonicalStringForUrl(url, operation);
  const signature = await hmacSha256Base64Url(
    issued.clientSigningToken,
    canonical,
  );

  const out = new URL(url.toString());
  out.searchParams.set(BLOB_PRESIGN_QUERY_DELEGATION, issued.delegationToken);
  out.searchParams.set(BLOB_PRESIGN_QUERY_SIGNATURE, signature);
  return out.toString();
}

/** @internal Exported for presign URL contract tests (must match proxy / api-blob). */
export function canonicalStringForUrl(
  url: URL,
  operation: DelegationOperation,
): string {
  const pathnameValue =
    operation === 'upload'
      ? decodeBlobObjectPath(url.searchParams.get('pathname') ?? '')
      : decodeBlobObjectPath(objectPathnameFromUrl(url));
  const lines: string[] = [
    `operation=${operation}`,
    `pathname=${pathnameValue}`,
  ];
  for (const k of PRESIGN_CANONICAL_QUERY_KEYS) {
    const v = url.searchParams.get(k);
    if (v !== null && v !== '') {
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
