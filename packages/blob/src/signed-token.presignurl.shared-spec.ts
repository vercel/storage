import { createHmac } from 'node:crypto';
import { BlobError } from './helpers';
import {
  BLOB_PRESIGN_QUERY_VALID_UNTIL,
  buildPresignCanonicalQueryEntries,
} from './presign-query-params';
import {
  canonicalString,
  type PresignUrlOptions,
  presignUrl,
} from './signed-token';
import {
  createDelegationToken,
  deriveClientSigningToken,
  randomBytes,
} from './signed-token.presignurl.test-helpers';

type DelegationPayload = {
  storeId: string;
  ownerId: string;
  pathname: string;
  operations: string[];
  validUntil: number;
  iat: number;
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
};

function readDelegationPayload(delegationToken: string): DelegationPayload {
  const seg = delegationToken.split('.')[0]!;
  return JSON.parse(
    Buffer.from(seg, 'base64url').toString('utf8'),
  ) as DelegationPayload;
}

async function expectSignatureMatches(
  delegationToken: string,
  clientSigningToken: string,
  options: PresignUrlOptions,
  nowMs: number,
): Promise<void> {
  const spy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
  try {
    const payload = await presignUrl(
      { delegationToken, clientSigningToken },
      options,
    );
    const scope = readDelegationPayload(delegationToken);
    const { pathname, operation } = options;
    const urlOptions =
      operation === 'put'
        ? {
            validUntil: options.validUntil,
            allowedContentTypes: options.allowedContentTypes,
            maximumSizeInBytes: options.maximumSizeInBytes,
            addRandomSuffix: options.addRandomSuffix,
            allowOverwrite: options.allowOverwrite,
            cacheControlMaxAge: options.cacheControlMaxAge,
            ifMatch: options.ifMatch,
            onUploadCompleted: options.onUploadCompleted,
          }
        : { validUntil: options.validUntil };
    const presignEntries = buildPresignCanonicalQueryEntries({
      operation,
      delegation: {
        validUntil: scope.validUntil,
        maximumSizeInBytes: scope.maximumSizeInBytes,
        allowedContentTypes: scope.allowedContentTypes,
      },
      urlOptions,
      nowMs,
    });
    const canonical = canonicalString(pathname, presignEntries, operation);
    const expected = createHmac('sha256', clientSigningToken)
      .update(canonical, 'utf8')
      .digest('base64url');
    expect(payload.signature).toBe(expected);
    expect(payload.delegationToken).toBe(delegationToken);
    expect(payload.options).toEqual(Object.fromEntries(presignEntries));
  } finally {
    spy.mockRestore();
  }
}

/**
 * Shared `presignUrl` assertions; run in Node and jsdom to exercise Web Crypto
 * the same way browsers do.
 */
export function registerPresignUrlTests(suiteName = 'presignUrl'): void {
  describe(suiteName, () => {
    const storeId = 's'.repeat(16);
    const blobSigningSecret = randomBytes(32).toString('base64');
    const now = Date.now();

    it('PUT: same signature for pathname whether target is PUT / or POST /mpu', async () => {
      const pathname = 'images/a.png';
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'owner_1',
          pathname,
          operations: ['put'],
          validUntil: now + 3600_000,
          iat: now,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      const presignedPut = await presignUrl(
        { delegationToken: delegation, clientSigningToken: client },
        { operation: 'put', pathname },
      );
      const presignedMpu = await presignUrl(
        { delegationToken: delegation, clientSigningToken: client },
        { operation: 'put', pathname },
      );
      expect(presignedPut.signature).toBe(presignedMpu.signature);
      expect(presignedPut.options).toEqual(presignedMpu.options);
      await expectSignatureMatches(
        delegation,
        client,
        { operation: 'put', pathname },
        now,
      );
      expect(
        presignedPut.options[BLOB_PRESIGN_QUERY_VALID_UNTIL],
      ).toBeUndefined();
    });

    it('POST /mpu: matches PUT canonical for the same pathname', async () => {
      const pathname = 'images/a.png';
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'owner_1',
          pathname,
          operations: ['put'],
          validUntil: now + 3600_000,
          iat: now,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      // URLs are only for documentation parity with real uploads; presign is pathname-based.
      await expectSignatureMatches(
        delegation,
        client,
        { operation: 'put', pathname },
        now,
      );
    });

    it('HMACs the documented canonical string and returns payload fields', async () => {
      const pathname = 'images/a.png';
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
      await expectSignatureMatches(
        delegation,
        client,
        { operation: 'get', pathname },
        now,
      );
    });

    it('same pathname yields identical presign payloads (deterministic)', async () => {
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
      const first = await presignUrl(
        { delegationToken: delegation, clientSigningToken: client },
        { operation: 'get', pathname },
      );
      const second = await presignUrl(
        { delegationToken: delegation, clientSigningToken: client },
        { operation: 'get', pathname },
      );
      expect(first).toEqual(second);
    });

    it('accepts logical pathname when the object URL would use percent-encoded segments', async () => {
      const logicalName = 'Image Background Removed (1).png';
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'owner_1',
          pathname: logicalName,
          operations: ['get'],
          validUntil: now + 3600_000,
          iat: now,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      await expectSignatureMatches(
        delegation,
        client,
        {
          operation: 'get',
          pathname: logicalName,
        },
        now,
      );
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
      await expect(
        presignUrl(
          {
            delegationToken: delegation,
            clientSigningToken: client,
          },
          { operation: 'get', pathname: 'b.png' },
        ),
      ).rejects.toThrow(BlobError);
    });

    it('adds signed `vercel-blob-valid-until` when `validUntil` is before delegation ceiling', async () => {
      const fixedNow = 1_700_000_000_000;
      const pathnameTtl = 'images/a.png';
      const validUntil = fixedNow + 3_600_000;
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'owner_1',
          pathname: pathnameTtl,
          operations: ['get'],
          validUntil,
          iat: fixedNow,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      const presignedUntil = fixedNow + 90_000;
      const spy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
      try {
        const payload = await presignUrl(
          { delegationToken: delegation, clientSigningToken: client },
          {
            operation: 'get',
            pathname: pathnameTtl,
            validUntil: presignedUntil,
          },
        );
        expect(payload.options[BLOB_PRESIGN_QUERY_VALID_UNTIL]).toBe(
          String(presignedUntil),
        );
        await expectSignatureMatches(
          delegation,
          client,
          {
            operation: 'get',
            pathname: pathnameTtl,
            validUntil: presignedUntil,
          },
          fixedNow,
        );
      } finally {
        spy.mockRestore();
      }
    });

    it('omits `vercel-blob-valid-until` when `validUntil` equals delegation ceiling', async () => {
      const fixedNow = 2_000_000_000_000;
      const validUntil = fixedNow + 120_000;
      const pathname = 'a.png';
      const delegation = createDelegationToken(
        {
          storeId: `store_${storeId}`,
          ownerId: 'o',
          pathname,
          operations: ['get'],
          validUntil,
          iat: fixedNow,
        },
        blobSigningSecret,
      );
      const client = deriveClientSigningToken(blobSigningSecret, delegation);
      const spy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
      try {
        const payload = await presignUrl(
          { delegationToken: delegation, clientSigningToken: client },
          { operation: 'get', pathname, validUntil },
        );
        expect(payload.options[BLOB_PRESIGN_QUERY_VALID_UNTIL]).toBeUndefined();
        await expectSignatureMatches(
          delegation,
          client,
          { operation: 'get', pathname, validUntil },
          fixedNow,
        );
      } finally {
        spy.mockRestore();
      }
    });
  });
}
