import { put } from './index';

// This files ensures some of the Node.js methods can also be called when imported in a browser

const BLOB_STORE_BASE_URL = 'https://storeId.public.blob.vercel-storage.com';

describe('blob client', () => {
  const fetchMock = jest.fn();

  describe('put', () => {
    beforeEach(() => {
      jest.resetAllMocks();

      globalThis.fetch = fetchMock;
    });

    it('should upload a file from the client', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                url: `${BLOB_STORE_BASE_URL}/foo-id.txt`,
                downloadUrl: `${BLOB_STORE_BASE_URL}/foo-id.txt?download=1`,
                pathname: 'foo.txt',
                contentType: 'text/plain',
                contentDisposition: 'attachment; filename="foo.txt"',
              }),
          }),
      });

      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          token: 'vercel_blob_client_123_token',
        }),
      ).resolves.toMatchInlineSnapshot(`
        {
          "contentDisposition": "attachment; filename="foo.txt"",
          "contentType": "text/plain",
          "downloadUrl": "https://storeId.public.blob.vercel-storage.com/foo-id.txt?download=1",
          "pathname": "foo.txt",
          "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
        }
      `);
    });
  });
});
