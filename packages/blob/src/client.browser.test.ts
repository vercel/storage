import undici from 'undici';
import { upload } from './client';

// can't use undici mocking utilities because jsdom does not support performance.markResourceTiming
jest.mock('undici', () => ({
  fetch: jest
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'blob.generate-client-token',
          clientToken: 'fake-token-for-test',
        }),
    })
    .mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          url: `https://storeId.public.blob.vercel-storage.com/superfoo.txt`,
          downloadUrl: `https://storeId.public.blob.vercel-storage.com/superfoo.txt?download=1`,
          pathname: 'foo.txt',
          contentType: 'text/plain',
          contentDisposition: 'attachment; filename="foo.txt"',
        }),
    }),
}));

describe('upload()', () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN =
      'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
    jest.clearAllMocks();
  });

  it('should upload a file from the client', async () => {
    await expect(
      upload('foo.txt', 'Test file data', {
        access: 'public',
        handleUploadUrl: '/api/upload',
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "contentDisposition": "attachment; filename="foo.txt"",
        "contentType": "text/plain",
        "downloadUrl": "https://storeId.public.blob.vercel-storage.com/superfoo.txt?download=1",
        "pathname": "foo.txt",
        "url": "https://storeId.public.blob.vercel-storage.com/superfoo.txt",
      }
    `);

    const fetchMock = undici.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/upload',
      {
        body: '{"type":"blob.generate-client-token","payload":{"pathname":"foo.txt","callbackUrl":"http://localhost:3000/api/upload","clientPayload":null,"multipart":false}}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://blob.vercel-storage.com/foo.txt',
      {
        body: 'Test file data',
        duplex: 'half',
        headers: {
          authorization: 'Bearer fake-token-for-test',
          'x-api-version': '7',
        },
        method: 'PUT',
      },
    );
  });
});
