import { type BlobCommandOptions, BlobError } from './helpers';
import {
  type DelegationOperation,
  type IssuedSignedToken,
  issueSignedToken,
} from './signed-token';

/**
 * Credentials in the shape the AWS SDK expects (`AwsCredentialIdentity`), so they
 * can be passed straight to `new S3Client({ credentials })`.
 */
export interface BlobS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** When these credentials stop working. The AWS SDK refreshes shortly before. */
  expiration: Date;
}

export type BlobS3CredentialsOptions = BlobCommandOptions & {
  /**
   * S3 operations the credentials may perform. `get`/`head` cover reads, `put` covers
   * uploads (including multipart), `delete` covers deletes. Listing needs `get` on the
   * whole store. Defaults to all four.
   */
  operations?: DelegationOperation[];
  /**
   * Restrict the credentials to a single object pathname. Defaults to `"*"` (the whole store).
   */
  pathname?: string;
  /**
   * Lifetime of each issued credential in milliseconds. Defaults to 1 hour, max 7 days.
   */
  durationMs?: number;
};

const ALL_OPERATIONS: DelegationOperation[] = ['get', 'head', 'put', 'delete'];
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * Exchanges the Blob auth in scope (OIDC token or `BLOB_READ_WRITE_TOKEN`) for
 * temporary S3-compatible credentials. Returns a provider function the AWS SDK
 * calls on first use and again before expiry, so nothing is cached by hand.
 *
 * ```ts
 * const s3 = new S3Client({
 *   endpoint: 'https://public.blob.vercel-storage.com',
 *   region: 'auto',
 *   credentials: blobS3Credentials(),
 * });
 * await s3.send(new PutObjectCommand({ Bucket: '<store id>', Key: 'hello.txt', Body: 'hi' }));
 * ```
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
  const { operations, pathname, durationMs, ...commandOptions } = options;
  if (operations !== undefined && operations.length === 0) {
    throw new BlobError('`operations` must be a non-empty array if provided');
  }
  const duration = durationMs ?? DEFAULT_DURATION_MS;
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new BlobError('`durationMs` must be a positive integer.');
  }

  const token = await issueSignedToken({
    ...commandOptions,
    operations: operations ?? ALL_OPERATIONS,
    pathname: pathname ?? '*',
    validUntil: Date.now() + duration,
  });
  return credentialsFromSignedToken(token);
}

/**
 * Maps a signed token onto S3 credentials: the delegation token is the access key id
 * and the client signing token is the secret. The Blob API verifies SigV4 with them.
 */
export function credentialsFromSignedToken(
  token: Pick<
    IssuedSignedToken,
    'delegationToken' | 'clientSigningToken' | 'validUntil'
  >,
): BlobS3Credentials {
  return {
    accessKeyId: token.delegationToken,
    secretAccessKey: token.clientSigningToken,
    expiration: new Date(token.validUntil),
  };
}
