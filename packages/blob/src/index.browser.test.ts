import { put } from './index';

jest.mock('undici', () => ({
  fetch: (): unknown =>
    Promise.resolve({
      status: 200,
      json: () =>
        Promise.resolve({
          url: `${BASE_URL}/storeid/foo-id.txt`,
          size: 12345,
          uploadedAt: '2023-05-04T15:12:07.818Z',
          pathname: 'foo.txt',
          contentType: 'text/plain',
          contentDisposition: 'attachment; filename="foo.txt"',
        }),
    }),
}));
const BASE_URL = 'https://blob.vercel-storage.com';

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
        }),
      ).resolves.toMatchInlineSnapshot(`
        {
          "contentDisposition": "attachment; filename="foo.txt"",
          "contentType": "text/plain",
          "pathname": "foo.txt",
          "size": 12345,
          "uploadedAt": 2023-05-04T15:12:07.818Z,
          "url": "https://blob.vercel-storage.com/storeid/foo-id.txt",
        }
      `);
    });

    it('should throw when calling `put()` with a server token', async () => {
      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          contentType: 'text/plain',
          token: 'vercel_blob_rw_123_TEST_TOKEN',
        }),
      ).rejects.toThrow(
        new Error('Vercel Blob: client upload only supports client tokens'),
      );
    });
  });
});
