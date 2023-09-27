import { put } from './index';

const BLOB_STORE_BASE_URL = 'https://storeId.public.blob.vercel-storage.com';

jest.mock('undici', () => ({
  fetch: (): unknown =>
    Promise.resolve({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          url: `${BLOB_STORE_BASE_URL}/foo-id.txt`,
          pathname: 'foo.txt',
          contentType: 'text/plain',
          contentDisposition: 'attachment; filename="foo.txt"',
        }),
    }),
}));

describe('blob client', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('put', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should upload a file from the client', async () => {
      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          token: 'vercel_blob_client_123_token',
        })
      ).resolves.toMatchInlineSnapshot(`
        {
          "contentDisposition": "attachment; filename="foo.txt"",
          "contentType": "text/plain",
          "pathname": "foo.txt",
          "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
        }
      `);
    });
  });
});
