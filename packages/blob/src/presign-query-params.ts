/**
 * Per-query presign constraints on signed blob URLs. Must stay aligned with
 * api-blob and proxy (`signed_url.go`).
 *
 * Each listed param participates in the HMAC canonical string as `key=value`
 * (decoded query value), sorted with `operation` and `pathname`.
 *
 * Callback completion uses two params (no nested JSON in the query string):
 * `vercel-blob-callback-url` and optional `vercel-blob-callback-token-payload`.
 */

export const BLOB_PRESIGN_QUERY_VALID_UNTIL =
  'vercel-blob-valid-until' as const;
export const BLOB_PRESIGN_QUERY_MAXIMUM_SIZE =
  'vercel-blob-maximum-size-in-bytes' as const;
export const BLOB_PRESIGN_QUERY_ALLOWED_CONTENT_TYPES =
  'vercel-blob-allowed-content-types' as const;
export const BLOB_PRESIGN_QUERY_ADD_RANDOM_SUFFIX =
  'vercel-blob-add-random-suffix' as const;
export const BLOB_PRESIGN_QUERY_ALLOW_OVERWRITE =
  'vercel-blob-allow-overwrite' as const;
export const BLOB_PRESIGN_QUERY_CACHE_CONTROL_MAX_AGE =
  'vercel-blob-cache-control-max-age' as const;
export const BLOB_PRESIGN_QUERY_IF_MATCH = 'vercel-blob-if-match' as const;
export const BLOB_PRESIGN_QUERY_CALLBACK_URL =
  'vercel-blob-callback-url' as const;
export const BLOB_PRESIGN_QUERY_CALLBACK_TOKEN_PAYLOAD =
  'vercel-blob-callback-token-payload' as const;

/**
 * Presign constraint query names
 */
export const PRESIGN_QUERY = {
  validUntil: BLOB_PRESIGN_QUERY_VALID_UNTIL,
  maximumSizeInBytes: BLOB_PRESIGN_QUERY_MAXIMUM_SIZE,
  allowedContentTypes: BLOB_PRESIGN_QUERY_ALLOWED_CONTENT_TYPES,
  addRandomSuffix: BLOB_PRESIGN_QUERY_ADD_RANDOM_SUFFIX,
  allowOverwrite: BLOB_PRESIGN_QUERY_ALLOW_OVERWRITE,
  cacheControlMaxAge: BLOB_PRESIGN_QUERY_CACHE_CONTROL_MAX_AGE,
  ifMatch: BLOB_PRESIGN_QUERY_IF_MATCH,
  callbackUrl: BLOB_PRESIGN_QUERY_CALLBACK_URL,
  callbackTokenPayload: BLOB_PRESIGN_QUERY_CALLBACK_TOKEN_PAYLOAD,
} as const;

/** Sorted UTF-8 (lexicographic over param names). */
export const PRESIGN_CANONICAL_QUERY_KEYS = [
  BLOB_PRESIGN_QUERY_ADD_RANDOM_SUFFIX,
  BLOB_PRESIGN_QUERY_ALLOW_OVERWRITE,
  BLOB_PRESIGN_QUERY_ALLOWED_CONTENT_TYPES,
  BLOB_PRESIGN_QUERY_CACHE_CONTROL_MAX_AGE,
  BLOB_PRESIGN_QUERY_CALLBACK_TOKEN_PAYLOAD,
  BLOB_PRESIGN_QUERY_CALLBACK_URL,
  BLOB_PRESIGN_QUERY_IF_MATCH,
  BLOB_PRESIGN_QUERY_MAXIMUM_SIZE,
  BLOB_PRESIGN_QUERY_VALID_UNTIL,
] as const;

export type PresignCanonicalQueryKey =
  (typeof PRESIGN_CANONICAL_QUERY_KEYS)[number];

export const MAX_PRESIGN_CALLBACK_URL_CHARS = 4096;
export const MAX_PRESIGN_CALLBACK_TOKEN_PAYLOAD_CHARS = 8192;

export type PresignOptionsOnUploadCompletedWire = {
  callbackUrl: string;
  tokenPayload?: string | null;
};

export type DelegationScopeForPresign = {
  validUntil: number;
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
};

function contentTypeAllowedByList(
  contentType: string,
  allowed: readonly string[],
): boolean {
  const [type] = contentType.split('/');
  const wildcard = `${type}/*`;
  return (
    allowed.includes(contentType) || (type ? allowed.includes(wildcard) : false)
  );
}

function assertAllowedContentTypesSubset(
  optionsTypes: string[] | undefined,
  delegationTypes: string[] | undefined,
  label: string,
): void {
  if (!optionsTypes?.length) {
    return;
  }
  if (!delegationTypes?.length) {
    return;
  }
  for (const ct of optionsTypes) {
    if (!contentTypeAllowedByList(ct, delegationTypes)) {
      throw new Error(
        `${label}: allowedContentTypes entry "${ct}" is not permitted by the delegation token.`,
      );
    }
  }
}

function assertNumberSubset(
  name: string,
  optionVal: number | undefined,
  delegationVal: number | undefined,
  label: string,
  mode: 'lte' | 'eqIfDelegation',
): void {
  if (optionVal === undefined) {
    return;
  }
  if (delegationVal === undefined) {
    return;
  }
  if (mode === 'lte' && optionVal > delegationVal) {
    throw new Error(
      `${label}: ${name} must be ≤ delegation (${String(delegationVal)}).`,
    );
  }
}

function isPlausibleAbsoluteUrl(s: string): boolean {
  if (typeof URL !== 'undefined' && typeof URL.canParse === 'function') {
    return URL.canParse(s);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/** Callback is URL-only; delegation never embeds `onUploadCompleted`. */
function validatePresignUrlOnUploadCompletedWire(
  opt: PresignOptionsOnUploadCompletedWire | undefined,
  label: string,
): void {
  if (!opt) {
    return;
  }
  if (typeof opt.callbackUrl !== 'string' || opt.callbackUrl.length === 0) {
    throw new Error(
      `${label}: onUploadCompleted.callbackUrl must be a non-empty string.`,
    );
  }
  if (opt.callbackUrl.length > MAX_PRESIGN_CALLBACK_URL_CHARS) {
    throw new Error(`${label}: onUploadCompleted.callbackUrl is too long.`);
  }
  if (!isPlausibleAbsoluteUrl(opt.callbackUrl)) {
    throw new Error(
      `${label}: onUploadCompleted.callbackUrl must be a valid URL.`,
    );
  }
  if (opt.tokenPayload !== undefined && opt.tokenPayload !== null) {
    if (typeof opt.tokenPayload !== 'string') {
      throw new Error(
        `${label}: onUploadCompleted.tokenPayload must be a string.`,
      );
    }
    if (opt.tokenPayload.length > MAX_PRESIGN_CALLBACK_TOKEN_PAYLOAD_CHARS) {
      throw new Error(`${label}: onUploadCompleted.tokenPayload is too long.`);
    }
  }
}

export const MAX_PRESIGN_CACHE_CONTROL_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const MAX_PRESIGN_IF_MATCH_LENGTH = 256;

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally blocking them
const IF_MATCH_CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

type PresignUrlConstraintOptions = {
  validUntil?: number;
  allowedContentTypes?: string[];
  maximumSizeInBytes?: number;
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  cacheControlMaxAge?: number;
  ifMatch?: string;
  onUploadCompleted?: PresignOptionsOnUploadCompletedWire;
};

/** `addRandomSuffix` / `allowOverwrite` are wire-only; validate numeric / string fields. */
function validateUrlOnlyPresignUploadOptions(
  urlOptions: PresignUrlConstraintOptions,
  label: string,
): void {
  if (urlOptions.cacheControlMaxAge !== undefined) {
    const n = urlOptions.cacheControlMaxAge;
    if (
      !Number.isInteger(n) ||
      n < 0 ||
      n > MAX_PRESIGN_CACHE_CONTROL_MAX_AGE_SECONDS
    ) {
      throw new Error(
        `${label}: cacheControlMaxAge must be an integer between 0 and ${MAX_PRESIGN_CACHE_CONTROL_MAX_AGE_SECONDS}.`,
      );
    }
  }
  if (urlOptions.ifMatch !== undefined) {
    const im = urlOptions.ifMatch;
    if (typeof im !== 'string' || im.length === 0) {
      throw new Error(`${label}: ifMatch must be a non-empty string.`);
    }
    if (im.length > MAX_PRESIGN_IF_MATCH_LENGTH) {
      throw new Error(`${label}: ifMatch is too long.`);
    }
    if (IF_MATCH_CONTROL_CHARS_RE.test(im)) {
      throw new Error(
        `${label}: ifMatch contains disallowed control characters.`,
      );
    }
  }
}

function sortedContentTypesCsv(types: readonly string[]): string {
  return [...types].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',');
}

/**
 * Clears presign constraint params (not delegation/signature) from a URL.
 */
export function deletePresignCanonicalParams(url: URL): void {
  for (const k of PRESIGN_CANONICAL_QUERY_KEYS) {
    url.searchParams.delete(k);
  }
}

/**
 * Computes resolved URL expiry (ms). When omitted from the wire, callers treat
 * it as the delegation ceiling.
 */
export function resolvePresignUrlValidUntilMs(args: {
  delegationValidUntil: number;
  urlOptions?: { validUntil?: number };
  nowMs: number;
}): number {
  const { delegationValidUntil, urlOptions, nowMs } = args;
  let t: number;
  if (urlOptions?.validUntil !== undefined) {
    if (
      typeof urlOptions.validUntil !== 'number' ||
      !Number.isFinite(urlOptions.validUntil)
    ) {
      throw new Error('presignUrl: validUntil must be a finite number (ms).');
    }
    t = Math.trunc(urlOptions.validUntil);
  } else {
    t = Math.trunc(delegationValidUntil);
  }
  if (Number.isFinite(delegationValidUntil)) {
    t = Math.min(t, Math.trunc(delegationValidUntil));
  }
  if (t <= nowMs) {
    throw new Error(
      'presignUrl: resolved URL expiry is not after the current time; issue a new delegation token or pass a later validUntil.',
    );
  }
  return t;
}

/**
 * Returns entries to set on the URL before signing. Omits
 * `vercel-blob-valid-until` when it equals the delegation ceiling (server
 * defaults to delegation expiry).
 */
export function buildPresignCanonicalQueryEntries(args: {
  operation: 'get' | 'head' | 'put';
  delegation: DelegationScopeForPresign;
  urlOptions?: {
    validUntil?: number;
    allowedContentTypes?: string[];
    maximumSizeInBytes?: number;
    addRandomSuffix?: boolean;
    allowOverwrite?: boolean;
    cacheControlMaxAge?: number;
    ifMatch?: string;
    onUploadCompleted?: PresignOptionsOnUploadCompletedWire;
  };
  nowMs: number;
}): [string, string][] {
  const { operation, delegation, urlOptions, nowMs } = args;
  const label = 'presignUrl';
  const resolvedUntil = resolvePresignUrlValidUntilMs({
    delegationValidUntil: delegation.validUntil,
    urlOptions,
    nowMs,
  });
  const delegUntil = Math.trunc(delegation.validUntil);
  const entries: [string, string][] = [];

  if (resolvedUntil < delegUntil) {
    entries.push([BLOB_PRESIGN_QUERY_VALID_UNTIL, String(resolvedUntil)]);
  }

  if (operation !== 'put' || !urlOptions) {
    return entries;
  }

  assertAllowedContentTypesSubset(
    urlOptions.allowedContentTypes,
    delegation.allowedContentTypes,
    label,
  );
  assertNumberSubset(
    'maximumSizeInBytes',
    urlOptions.maximumSizeInBytes,
    delegation.maximumSizeInBytes,
    label,
    'lte',
  );
  validateUrlOnlyPresignUploadOptions(urlOptions, label);
  validatePresignUrlOnUploadCompletedWire(urlOptions.onUploadCompleted, label);

  if (urlOptions.allowedContentTypes !== undefined) {
    const csv = sortedContentTypesCsv(urlOptions.allowedContentTypes);
    if (csv.length > 16_384) {
      throw new Error(`${label}: allowedContentTypes query value is too long.`);
    }
    entries.push([BLOB_PRESIGN_QUERY_ALLOWED_CONTENT_TYPES, csv]);
  }
  if (urlOptions.maximumSizeInBytes !== undefined) {
    entries.push([
      BLOB_PRESIGN_QUERY_MAXIMUM_SIZE,
      String(Math.trunc(urlOptions.maximumSizeInBytes)),
    ]);
  }
  if (urlOptions.addRandomSuffix !== undefined) {
    entries.push([
      BLOB_PRESIGN_QUERY_ADD_RANDOM_SUFFIX,
      urlOptions.addRandomSuffix ? 'true' : 'false',
    ]);
  }
  if (urlOptions.allowOverwrite !== undefined) {
    entries.push([
      BLOB_PRESIGN_QUERY_ALLOW_OVERWRITE,
      urlOptions.allowOverwrite ? 'true' : 'false',
    ]);
  }
  if (urlOptions.cacheControlMaxAge !== undefined) {
    entries.push([
      BLOB_PRESIGN_QUERY_CACHE_CONTROL_MAX_AGE,
      String(Math.trunc(urlOptions.cacheControlMaxAge)),
    ]);
  }
  if (urlOptions.ifMatch !== undefined) {
    entries.push([BLOB_PRESIGN_QUERY_IF_MATCH, urlOptions.ifMatch]);
  }
  if (urlOptions.onUploadCompleted !== undefined) {
    const { callbackUrl, tokenPayload } = urlOptions.onUploadCompleted;
    if (callbackUrl.length > MAX_PRESIGN_CALLBACK_URL_CHARS) {
      throw new Error(`${label}: onUploadCompleted.callbackUrl is too long.`);
    }
    entries.push([BLOB_PRESIGN_QUERY_CALLBACK_URL, callbackUrl]);
    if (
      tokenPayload !== undefined &&
      tokenPayload !== null &&
      tokenPayload !== ''
    ) {
      if (tokenPayload.length > MAX_PRESIGN_CALLBACK_TOKEN_PAYLOAD_CHARS) {
        throw new Error(
          `${label}: onUploadCompleted.tokenPayload is too long.`,
        );
      }
      entries.push([BLOB_PRESIGN_QUERY_CALLBACK_TOKEN_PAYLOAD, tokenPayload]);
    }
  }

  return entries;
}
