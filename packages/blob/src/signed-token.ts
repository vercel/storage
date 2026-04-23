import { requestApi } from './api';
import { type BlobCommandOptions, BlobError } from './helpers';

/** Operations that may be encoded in a delegation token (v1: read scope). */
export type DelegationOperation = 'get' | 'head';

/** Excluded from the string-to-sign; added after signing. @public for CDN / tooling alignment */
export const BLOB_PRESIGN_QUERY_DELEGATION = 'vercel-blob-delegation' as const;
/** @public for CDN / tooling alignment */
export const BLOB_PRESIGN_QUERY_SIGNATURE = 'vercel-blob-signature' as const;

export const BLOB_PRESIGN_QUERY_URL_EXPIRES =
  'vercel-blob-url-expires' as const;

const PRESIGN_EXCLUDE = new Set<string>([
  BLOB_PRESIGN_QUERY_DELEGATION,
  BLOB_PRESIGN_QUERY_SIGNATURE,
]);

/**
 * Min/max TTL the API allows for signed tokens (seconds). Matches the blob API
 * `issue_signed_token` handler.
 */
export const SIGNED_TOKEN_MIN_TTL_SECONDS = 60 * 60;
export const SIGNED_TOKEN_MAX_TTL_SECONDS = 24 * 60 * 60;

/**
 * Result of `issueSignedToken` — the same values returned from `POST /signed-token` on
 * the Blob API. Use with {@link presignUrl} to build a URL that can authorize GET/HEAD
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
   * Allowed read operations. When omitted, the API defaults to read (`get`) only.
   */
  operations?: DelegationOperation[];
  /**
   * Time-to-live in seconds, between {@link SIGNED_TOKEN_MIN_TTL_SECONDS} and
   * {@link SIGNED_TOKEN_MAX_TTL_SECONDS}. When omitted, the API uses the minimum (1h).
   */
  ttlSeconds?: number;
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
 */
export async function issueSignedToken(
  options: IssueSignedTokenOptions,
): Promise<IssuedSignedToken> {
  if (!options) {
    throw new BlobError('`issueSignedToken` requires an options object');
  }

  const body: {
    pathname?: string;
    operations?: DelegationOperation[];
    ttlSeconds?: number;
  } = {};
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
 * @internal
 */
function assertBlobHost(hostname: string): { storeId: string } {
  const isPublic = hostname.endsWith('.public.blob.vercel-storage.com');
  const isPrivate = hostname.endsWith('.private.blob.vercel-storage.com');
  if (!isPublic && !isPrivate) {
    throw new BlobError(
      'The URL must use a Vercel Blob host (*.public|*.private.blob.vercel-storage.com).',
    );
  }
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
 * HMAC-SHA256 with a UTF-8 string key, Base64 (standard) in, then Base64url out.
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

/**
 * Optional settings for {@link presignUrl}.
 */
export type PresignUrlOptions = {
  /**
   * Shorter lifetime for this specific URL, in **seconds** from the time
   * `presignUrl` runs. Capped to the delegation payload’s `validUntil`.
   * When set, a `vercel-blob-url-expires` query param (ms since epoch) is
   * added and included in the HMAC. Omit to rely only on delegation scope.
   */
  ttlSeconds?: number;
};

/**
 * Builds a **presigned read URL** by HMACing a canonical string with
 * `clientSigningToken` and appending the delegation and signature
 * as query parameters. The CDN re-derives the signing key from
 * `delegationToken` and validates the HMAC, scope, and expiry.
 *
 * **Canonical string** (must match the verification implementation on the edge):
 * `<METHOD in upper case>\\n<origin><pathname>[?<sorted query without delegation/signature parameters>]`
 *
 * Query pairs are sorted lexicographically by key, then value. The optional
 * `vercel-blob-url-expires` (when using `options.ttlSeconds`) is part of the
 * signed string. Delegation and signature parameters are **omitted** from the
 * string-to-sign, then appended
 * to the final URL. Callers or browsers use this URL to **fetch the blob** without
 * a bearer.
 */
export async function presignUrl(
  blobUrl: string,
  issued: Pick<IssuedSignedToken, 'clientSigningToken' | 'delegationToken'>,
  method: 'GET' | 'HEAD' = 'GET',
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

  const u = new URL(blobUrl);
  u.searchParams.delete(BLOB_PRESIGN_QUERY_DELEGATION);
  u.searchParams.delete(BLOB_PRESIGN_QUERY_SIGNATURE);
  u.searchParams.delete(BLOB_PRESIGN_QUERY_URL_EXPIRES);

  const { storeId: hostStoreId } = assertBlobHost(u.hostname);

  const scope = tryDecodePayload(issued.delegationToken);
  if (!scope) {
    throw new BlobError('Invalid or unreadable `delegationToken` payload.');
  }
  if (scope.storeId && scope.storeId !== hostStoreId) {
    throw new BlobError(
      'Store id in the URL does not match the delegation token.',
    );
  }
  const opPath = objectPathnameFromUrl(u);
  const p = scope.pathname;
  if (p && p !== '*') {
    if (opPath !== p) {
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

  const m = method.toUpperCase() === 'HEAD' ? 'HEAD' : 'GET';
  if (m === 'HEAD' && !scope.operations?.includes('head')) {
    throw new BlobError(
      'The delegation token is not valid for `HEAD` requests. Include `"head"` in `operations` when calling `issueSignedToken`.',
    );
  }
  if (m === 'GET' && !scope.operations?.includes('get')) {
    throw new BlobError(
      'The delegation token is not valid for `GET` requests. Include `"get"` in `operations` when calling `issueSignedToken`.',
    );
  }

  if (options?.ttlSeconds !== undefined) {
    if (
      typeof options.ttlSeconds !== 'number' ||
      !Number.isFinite(options.ttlSeconds) ||
      options.ttlSeconds <= 0
    ) {
      throw new BlobError(
        '`options.ttlSeconds` must be a positive finite number.',
      );
    }
    const t = Date.now();
    let expiresAt = t + options.ttlSeconds * 1000;
    if (Number.isFinite(scope.validUntil)) {
      expiresAt = Math.min(expiresAt, scope.validUntil);
    }
    if (expiresAt <= t) {
      throw new BlobError(
        '`ttlSeconds` would expire at or before the current time, or the delegation is already at `validUntil`. Use a larger ttl or a fresh `issueSignedToken` result.',
      );
    }
    u.searchParams.set(
      BLOB_PRESIGN_QUERY_URL_EXPIRES,
      String(Math.trunc(expiresAt)),
    );
  }

  const canonical = canonicalStringForUrl(u, m);
  const signature = await hmacSha256Base64Url(
    issued.clientSigningToken,
    canonical,
  );

  const out = new URL(u.toString());
  for (const k of [...out.searchParams.keys()]) {
    if (PRESIGN_EXCLUDE.has(k)) {
      out.searchParams.delete(k);
    }
  }
  out.searchParams.set(BLOB_PRESIGN_QUERY_DELEGATION, issued.delegationToken);
  out.searchParams.set(BLOB_PRESIGN_QUERY_SIGNATURE, signature);
  return out.toString();
}

/**
 * @internal
 */
function canonicalStringForUrl(u: URL, method: 'GET' | 'HEAD'): string {
  const us = new URL(u.toString());
  for (const k of [...us.searchParams.keys()]) {
    if (PRESIGN_EXCLUDE.has(k)) {
      us.searchParams.delete(k);
    }
  }
  const q = sortSearchParams(us.searchParams);
  const path = us.pathname;
  const base = `${us.origin}${path}`;
  return q ? `${method}\n${base}?${q}` : `${method}\n${base}`;
}

/**
 * @internal
 */
function sortSearchParams(input: URLSearchParams): string {
  const parts: [string, string][] = [];
  for (const [k, v] of input) {
    parts.push([k, v]);
  }
  parts.sort((a, b) => {
    const c = a[0].localeCompare(b[0]);
    return c !== 0 ? c : a[1].localeCompare(b[1]);
  });
  return new URLSearchParams(parts).toString();
}
