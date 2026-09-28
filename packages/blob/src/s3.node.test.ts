import undici from 'undici';
import { blobS3Credentials, issueBlobS3Credentials } from './s3';

let oidcTokenFromEnv: string | undefined;
jest.mock('@vercel/oidc', () => {
  const actual = jest.requireActual('@vercel/oidc');
  return {
    ...actual,
    getVercelOidcToken: () =>
      oidcTokenFromEnv
        ? Promise.resolve(oidcTokenFromEnv)
        : Promise.reject(new Error('no token')),
  };
});

const OIDC_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig';

describe('s3 credentials', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    process.env = { ...OLD_ENV, BLOB_STORE_ID: 'store_12345fakeStoreId' };
    delete process.env.BLOB_READ_WRITE_TOKEN;
    oidcTokenFromEnv = OIDC_TOKEN;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const apiResponse = {
    accessKeyId: 'eyJwYXlsb2FkIjoxfQ.sig',
    secretAccessKey: 's3-secret',
    expiration: '2030-01-01T00:00:00.000Z',
    endpoint: 'https://public.blob.vercel-storage.com',
    bucket: '12345fakestoreid',
    region: 'auto',
  };

  function mockApi() {
    return jest.spyOn(undici, 'fetch').mockImplementation(
      jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () => Promise.resolve(apiResponse),
      }),
    );
  }

  it('exchanges the OIDC token for S3-shaped credentials', async () => {
    const fetchMock = mockApi();

    const credentials = await issueBlobS3Credentials();

    expect(credentials).toEqual({
      ...apiResponse,
      expiration: new Date('2030-01-01T00:00:00.000Z'),
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://vercel.com/api/blob/s3-credentials');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({});
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${OIDC_TOKEN}`);
    expect(headers['x-vercel-blob-store-id']).toBe('12345fakeStoreId');
  });

  it('forwards scope options and returns a provider function', async () => {
    const fetchMock = mockApi();
    const provider = blobS3Credentials({
      operations: ['get', 'get'],
      pathname: 'a/b.txt',
      durationMs: 60_000,
      storeId: 'otherStore',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await provider();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ operations: ['get'], pathname: 'a/b.txt' });
    expect(body.validUntil).toBeGreaterThan(Date.now());
    expect(
      (init.headers as Record<string, string>)['x-vercel-blob-store-id'],
    ).toBe('otherStore');
  });

  it('requires an OIDC token even when a read-write token is present', async () => {
    oidcTokenFromEnv = undefined;
    process.env.BLOB_READ_WRITE_TOKEN =
      'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
    const fetchMock = mockApi();
    await expect(issueBlobS3Credentials()).rejects.toThrow(
      'requires a Vercel OIDC token',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty operations and bad durations', async () => {
    await expect(issueBlobS3Credentials({ operations: [] })).rejects.toThrow(
      '`operations` must be a non-empty array',
    );
    await expect(issueBlobS3Credentials({ durationMs: 0 })).rejects.toThrow(
      '`durationMs` must be a positive integer',
    );
  });
});
