import { createHmac, randomBytes } from 'node:crypto';

function toBase64urlFromBase64(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Matches `api-blob` `createDelegationToken` (test-only) so we can issue tokens
 * locally and assert `presignUrl` matches the same HMAC the edge will check.
 */
export function createDelegationToken(
  payload: {
    storeId: string;
    ownerId: string;
    pathname: string;
    operations: string[];
    validUntil: number;
    iat: number;
  },
  blobSigningSecret: string,
): string {
  const payloadJson = JSON.stringify(payload);
  const payloadSegment = toBase64urlFromBase64(
    Buffer.from(payloadJson, 'utf8').toString('base64'),
  );
  const sig = createHmac('sha256', blobSigningSecret)
    .update(payloadSegment, 'utf8')
    .digest('base64url');
  return `${payloadSegment}.${sig}`;
}

export function deriveClientSigningToken(
  blobSigningSecret: string,
  delegationToken: string,
): string {
  return createHmac('sha256', blobSigningSecret)
    .update(delegationToken, 'utf8')
    .digest('base64url');
}

export { randomBytes };
