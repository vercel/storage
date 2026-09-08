import undici from 'undici';
import {
  blobS3Credentials,
  credentialsFromSignedToken,
  issueBlobS3Credentials,
} from './s3';

jest.mock('@vercel/oidc', () => {
  const actual = jest.requireActual('@vercel/oidc');
  return { ...actual, getVercelOidcToken: () => Promise.resolve('') };
});

describe('s3 credentials', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    process.env = {
      ...OLD_ENV,
      BLOB_READ_WRITE_TOKEN:
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function mockSignedTokenResponse(validUntil: number) {
    return jest.spyOn(undici, 'fetch').mockImplementation(
      jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            delegationToken: 'eyJwYXlsb2FkIjoxfQ.sig',
            clientSigningToken: 'client-signing-token',
            validUntil,
          }),
      }),
    );
  }

  it('exchanges the blob token for S3-shaped credentials', async () => {
    const validUntil = Date.now() + 60_000;
    const fetchMock = mockSignedTokenResponse(validUntil);

    const credentials = await issueBlobS3Credentials({ durationMs: 60_000 });

    expect(credentials).toEqual({
      accessKeyId: 'eyJwYXlsb2FkIjoxfQ.sig',
      secretAccessKey: 'client-signing-token',
      expiration: new Date(validUntil),
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://vercel.com/api/blob/signed-token');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      operations: ['get', 'head', 'put', 'delete'],
      pathname: '*',
    });
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
    );
  });

  it('forwards scope options and returns a provider function', async () => {
    const fetchMock = mockSignedTokenResponse(Date.now() + 1000);
    const provider = blobS3Credentials({
      operations: ['get'],
      pathname: 'a/b.txt',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await provider();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      operations: ['get'],
      pathname: 'a/b.txt',
    });
  });

  it('rejects empty operations and bad durations', async () => {
    await expect(issueBlobS3Credentials({ operations: [] })).rejects.toThrow(
      '`operations` must be a non-empty array',
    );
    await expect(issueBlobS3Credentials({ durationMs: 0 })).rejects.toThrow(
      '`durationMs` must be a positive integer',
    );
  });

  it('maps signed tokens onto credentials', () => {
    expect(
      credentialsFromSignedToken({
        delegationToken: 'd.s',
        clientSigningToken: 'c',
        validUntil: 1000,
      }),
    ).toEqual({
      accessKeyId: 'd.s',
      secretAccessKey: 'c',
      expiration: new Date(1000),
    });
  });
});
