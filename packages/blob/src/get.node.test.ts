import { BlobError } from './helpers';
import { presignUrl } from './signed-token';
import {
  createDelegationToken,
  deriveClientSigningToken,
  randomBytes,
} from './signed-token.presignurl.test-helpers';

describe('presignUrl (get)', () => {
  const storeId = 's'.repeat(16);
  const blobSigningSecret = randomBytes(32).toString('base64');
  const now = Date.now();

  function makeSignedToken(pathname: string) {
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
    return {
      delegationToken,
      clientSigningToken,
      validUntil: now + 3600_000,
    };
  }

  it('builds a private object URL from pathname using storeId from the delegation token', async () => {
    const pathname = 'media/photo.png';
    const token = makeSignedToken(pathname);
    const getOpts = {
      operation: 'get' as const,
      pathname,
      access: 'private' as const,
    };
    const { presignedUrl: url } = await presignUrl(token, getOpts);
    const { presignedUrl: again } = await presignUrl(token, getOpts);
    expect(url).toBe(again);

    const parsed = new URL(url);
    expect(parsed.hostname).toBe(`${storeId}.private.blob.vercel-storage.com`);
    expect(parsed.pathname).toBe(`/${pathname}`);
    expect(parsed.searchParams.get('vercel-blob-delegation')).toBe(
      token.delegationToken,
    );
    expect(parsed.searchParams.get('vercel-blob-signature')).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });

  it('builds a public object URL when access is public', async () => {
    const pathname = 'a.png';
    const token = makeSignedToken(pathname);
    const { presignedUrl: url } = await presignUrl(token, {
      operation: 'get',
      pathname,
      access: 'public',
    });
    expect(new URL(url).hostname).toBe(
      `${storeId}.public.blob.vercel-storage.com`,
    );
  });

  it('keeps an explicit https blob URL as the base and merges existing query params', async () => {
    const logical = 'nested/file.bin';
    const pathnameWithQuery = `https://${storeId}.private.blob.vercel-storage.com/${logical}?existing=1`;
    const token = makeSignedToken(pathnameWithQuery);
    const getOpts = {
      operation: 'get' as const,
      pathname: pathnameWithQuery,
      access: 'private' as const,
    };
    const { presignedUrl: url } = await presignUrl(token, getOpts);
    const { presignedUrl: again } = await presignUrl(token, getOpts);
    expect(url).toBe(again);

    const parsed = new URL(url);
    expect(parsed.searchParams.get('existing')).toBe('1');
    expect(parsed.searchParams.get('vercel-blob-signature')).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      `https://${storeId}.private.blob.vercel-storage.com/${logical}`,
    );
  });

  it('treats http:// blob URLs as a full URL base', async () => {
    const logical = 'x.txt';
    const pathname = `http://${storeId}.private.blob.vercel-storage.com/${logical}`;
    const token = makeSignedToken(pathname);
    const { presignedUrl: url } = await presignUrl(token, {
      operation: 'get',
      pathname,
      access: 'private',
    });
    expect(new URL(url).protocol).toBe('http:');
    expect(new URL(url).searchParams.get('vercel-blob-delegation')).toBe(
      token.delegationToken,
    );
  });

  it('appends cache=0 when useCache is false on a private blob', async () => {
    const pathname = 'media/photo.png';
    const token = makeSignedToken(pathname);
    const { presignedUrl: url } = await presignUrl(token, {
      operation: 'get',
      pathname,
      access: 'private',
      useCache: false,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('cache')).toBe('0');

    // cache is not part of the signed payload: the signature is identical to
    // a URL presigned without useCache.
    const { presignedUrl: withoutBypass } = await presignUrl(token, {
      operation: 'get',
      pathname,
      access: 'private',
    });
    const withoutBypassParsed = new URL(withoutBypass);
    expect(withoutBypassParsed.searchParams.get('cache')).toBeNull();
    expect(parsed.searchParams.get('vercel-blob-signature')).toBe(
      withoutBypassParsed.searchParams.get('vercel-blob-signature'),
    );
  });

  it('does not append cache=0 when useCache is true or omitted', async () => {
    const pathname = 'media/photo.png';
    const token = makeSignedToken(pathname);
    const { presignedUrl: url } = await presignUrl(token, {
      operation: 'get',
      pathname,
      access: 'private',
      useCache: true,
    });
    expect(new URL(url).searchParams.get('cache')).toBeNull();
  });

  it('ignores useCache: false for public blobs (CDN only supports the bypass for private)', async () => {
    const pathname = 'a.png';
    const token = makeSignedToken(pathname);
    const { presignedUrl: url } = await presignUrl(token, {
      operation: 'get',
      pathname,
      access: 'public',
      useCache: false,
    });
    expect(new URL(url).searchParams.get('cache')).toBeNull();
  });

  it('rejects an invalid delegation token', async () => {
    const token = {
      delegationToken: 'not-a-jwt',
      clientSigningToken: 'Zm9v',
      validUntil: now + 3600_000,
    };
    await expect(
      presignUrl(token, {
        operation: 'get',
        pathname: 'a.png',
        access: 'private',
      }),
    ).rejects.toThrow(BlobError);
  });
});
