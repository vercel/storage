import { requestApi } from './api';
import { type BlobCommandOptions, BlobError } from './helpers';
import type { DelegationOperation } from './signed-token';
import { getVercelOidcToken } from './vercel-oidc-token';

/**
 * Credentials in the shape the AWS SDK expects (`AwsCredentialIdentity`), so they
 * can be passed straight to `new S3Client({ credentials })`.
 */
export interface BlobS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** When these credentials stop working. The AWS SDK refreshes shortly before. */
  expiration: Date;
  /** S3 endpoint to configure on the client, e.g. `https://public.blob.vercel-storage.com`. */
  endpoint: string;
  /** Bucket name to use with this store (its lowercase store id). */
  bucket: string;
  region: 'auto';
}

export type BlobS3CredentialsOptions = Pick<
  BlobCommandOptions,
  'oidcToken' | 'storeId' | 'abortSignal'
> & {
  /**
   * S3 operations the credentials may perform. `get`/`head` cover reads, `put` covers
   * uploads (including multipart), `delete` covers deletes. Listing needs `get` on the
   * whole store. Defaults to all four.
   */
  operations?: DelegationOperation[];
  /** Restrict the credentials to a single object pathname. Defaults to `"*"` (the whole store). */
  pathname?: string;
  /** Lifetime of each issued credential in milliseconds. Defaults to 1 hour, max 7 days. */
  durationMs?: number;
};

interface BlobS3CredentialsResponse {
  accessKeyId: string;
  secretAccessKey: string;
  expiration: string;
  endpoint: string;
  bucket: string;
  region: 'auto';
}

/**
 * Exchanges the Vercel OIDC token for temporary S3-compatible credentials. Returns a
 * provider function the AWS SDK calls on first use and again before expiry.
 *
 * ```ts
 * const s3 = new S3Client({
 *   endpoint: 'https://public.blob.vercel-storage.com',
 *   region: 'auto',
 *   credentials: blobS3Credentials(),
 * });
 * await s3.send(new PutObjectCommand({ Bucket: '<store id>', Key: 'hello.txt', Body: 'hi' }));
 * ```
 *
 * Requires OIDC: `VERCEL_OIDC_TOKEN` (or the `oidcToken` option) plus `BLOB_STORE_ID`
 * (or the `storeId` option). Read-write tokens cannot mint S3 credentials.
 */
export function blobS3Credentials(
  options: BlobS3CredentialsOptions = {},
): () => Promise<BlobS3Credentials> {
  return () => issueBlobS3Credentials(options);
}

/** One-shot variant of {@link blobS3Credentials}: issues a single credential set. */
export async function issueBlobS3Credentials(
  options: BlobS3CredentialsOptions = {},
): Promise<BlobS3Credentials> {
  const { operations, pathname, durationMs, oidcToken, ...commandOptions } =
    options;
  if (operations !== undefined && operations.length === 0) {
    throw new BlobError('`operations` must be a non-empty array if provided');
  }
  if (
    durationMs !== undefined &&
    (!Number.isInteger(durationMs) || durationMs <= 0)
  ) {
    throw new BlobError('`durationMs` must be a positive integer.');
  }

  const token = oidcToken?.trim() || (await getVercelOidcToken());
  if (!token) {
    throw new BlobError(
      '`blobS3Credentials` requires a Vercel OIDC token: set the `oidcToken` option or run where `VERCEL_OIDC_TOKEN` is available (see https://vercel.com/docs/oidc).',
    );
  }

  const body: Record<string, unknown> = {};
  if (operations !== undefined) {
    body.operations = Array.from(new Set(operations));
  }
  if (pathname !== undefined) {
    body.pathname = pathname;
  }
  if (durationMs !== undefined) {
    body.validUntil = Date.now() + durationMs;
  }

  const response = await requestApi<BlobS3CredentialsResponse>(
    '/s3-credentials',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: commandOptions.abortSignal,
    },
    { ...commandOptions, oidcToken: token },
  );
  return { ...response, expiration: new Date(response.expiration) };
}
