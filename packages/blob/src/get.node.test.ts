import { buildPresignedGetUrl } from './get';
import { BlobError } from './helpers';
import { presign } from './signed-token';
import {
  createDelegationToken,
  deriveClientSigningToken,
  randomBytes,
} from './signed-token.presignurl.test-helpers';

describe('buildPresignedGetUrl', () => {
  const storeId = 's'.repeat(16);
  const blobSigningSecret = randomBytes(32).toString('base64');
  const now = Date.now();

  async function makeGetPresignedPayload(pathname: string) {
    const delegationToken = createDelegationToken(
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
    const clientSigningToken = deriveClientSigningToken(
      blobSigningSecret,
      delegationToken,
    );
    return presign(
      { delegationToken, clientSigningToken },
      { operation: 'get', pathname },
    );
  }

  it('builds a private object URL from pathname using storeId from the delegation token', async () => {
    const pathname = 'media/photo.png';
    const payload = await makeGetPresignedPayload(pathname);
    const url = await buildPresignedGetUrl(pathname, payload, {
      access: 'private',
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe(`${storeId}.private.blob.vercel-storage.com`);
    expect(parsed.pathname).toBe(`/${pathname}`);
    expect(parsed.searchParams.get('vercel-blob-delegation')).toBe(
      payload.delegationToken,
    );
    expect(parsed.searchParams.get('vercel-blob-signature')).toBe(
      payload.signature,
    );
    for (const [key, value] of Object.entries(payload.params)) {
      expect(parsed.searchParams.get(key)).toBe(value);
    }
  });

  it('builds a public object URL when access is public', async () => {
    const pathname = 'a.png';
    const payload = await makeGetPresignedPayload(pathname);
    const url = await buildPresignedGetUrl(pathname, payload, {
      access: 'public',
    });
    expect(new URL(url).hostname).toBe(
      `${storeId}.public.blob.vercel-storage.com`,
    );
  });

  it('keeps an explicit https blob URL as the base and only adds presigned query params', async () => {
    const pathname = 'nested/file.bin';
    const payload = await makeGetPresignedPayload(pathname);
    const base = `https://${storeId}.private.blob.vercel-storage.com/${pathname}?existing=1`;
    const url = await buildPresignedGetUrl(base, payload, {
      access: 'private',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('existing')).toBe('1');
    expect(parsed.searchParams.get('vercel-blob-signature')).toBe(
      payload.signature,
    );
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      `https://${storeId}.private.blob.vercel-storage.com/${pathname}`,
    );
  });

  it('treats http:// blob URLs as a full URL base', async () => {
    const pathname = 'x.txt';
    const payload = await makeGetPresignedPayload(pathname);
    const base = `http://${storeId}.private.blob.vercel-storage.com/${pathname}`;
    const url = await buildPresignedGetUrl(base, payload, {
      access: 'private',
    });
    expect(new URL(url).protocol).toBe('http:');
    expect(new URL(url).searchParams.get('vercel-blob-delegation')).toBe(
      payload.delegationToken,
    );
  });

  it('rejects an invalid delegation token when resolving storeId from pathname', async () => {
    const payload = {
      delegationToken: 'not-a-jwt',
      signature: 'sig',
      params: {},
    };
    await expect(
      buildPresignedGetUrl('a.png', payload, { access: 'private' }),
    ).rejects.toThrow(BlobError);
  });
});
