import { createHmac } from 'node:crypto';
import { BlobError } from './helpers';
import {
  BLOB_PRESIGN_QUERY_DELEGATION,
  BLOB_PRESIGN_QUERY_SIGNATURE,
  presignUrl,
} from './signed-token';
import {
  createDelegationToken,
  deriveClientSigningToken,
  randomBytes,
} from './signed-token.presignurl.test-helpers';

/**
 * Shared `presignUrl` assertions; run in Node and jsdom to exercise Web Crypto
 * the same way browsers do.
 */
export function registerPresignUrlTests(suiteName = 'presignUrl'): void {
  describe(suiteName, () => {
    const storeId = 's'.repeat(16);
    const blobSigningSecret = randomBytes(32).toString('base64');
    const now = Date.now();

    it('HMACs the documented canonical string and appends query params', async () => {
      const pathname = 'images/a.png';
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'owner_1',
          pathname,
          operations: ['get', 'head'],
          validUntil: now + 3600_000,
          iat: now,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      const base = `https://store_${storeId}.public.blob.vercel-storage.com/${pathname}`;
      const presigned = await presignUrl(
        base,
        { delegationToken: delegation, clientSigningToken: client },
        'GET',
      );
      const u = new URL(presigned);
      const sig = u.searchParams.get(BLOB_PRESIGN_QUERY_SIGNATURE) ?? '';
      const d = u.searchParams.get(BLOB_PRESIGN_QUERY_DELEGATION) ?? '';
      expect(d).toBe(delegation);

      const canonical = `GET\nhttps://store_${storeId}.public.blob.vercel-storage.com/${pathname}`;
      const expected = createHmac('sha256', client)
        .update(canonical, 'utf8')
        .digest('base64url');
      expect(sig).toBe(expected);
    });

    it('includes sorted query in the string-to-sign, excluding presign parameters', async () => {
      const pathname = 'x.txt';
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'owner_1',
          pathname,
          operations: ['get'],
          validUntil: now + 3600_000,
          iat: now,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      const base = `https://store_${storeId}.private.blob.vercel-storage.com/${pathname}?b=2&a=1`;
      const first = await presignUrl(
        base,
        { delegationToken: delegation, clientSigningToken: client },
        'GET',
      );
      const second = await presignUrl(
        `https://store_${storeId}.private.blob.vercel-storage.com/${pathname}?a=1&b=2`,
        { delegationToken: delegation, clientSigningToken: client },
        'GET',
      );
      const u1 = new URL(first);
      const u2 = new URL(second);
      expect(u1.searchParams.get(BLOB_PRESIGN_QUERY_SIGNATURE)).toBe(
        u2.searchParams.get(BLOB_PRESIGN_QUERY_SIGNATURE),
      );
      const canonical = `GET\nhttps://store_${storeId}.private.blob.vercel-storage.com/${pathname}?a=1&b=2`;
      expect(
        createHmac('sha256', client)
          .update(canonical, 'utf8')
          .digest('base64url'),
      ).toBe(u1.searchParams.get(BLOB_PRESIGN_QUERY_SIGNATURE));
    });

    it('rejects path mismatch for scoped non-wildcard tokens', async () => {
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'o',
          pathname: 'a.png',
          operations: ['get'],
          validUntil: now + 3600_000,
          iat: now,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      const wrongPath = `https://store_${storeId}.public.blob.vercel-storage.com/b.png`;
      await expect(
        presignUrl(wrongPath, {
          delegationToken: delegation,
          clientSigningToken: client,
        }),
      ).rejects.toThrow(BlobError);
    });
  });
}
