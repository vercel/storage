import { type Interceptable, MockAgent, setGlobalDispatcher } from 'undici';
import { put } from './index';

const BASE_URL = 'https://blob.vercel-storage.com';
const mockAgent = new MockAgent();
mockAgent.disableNetConnect();

setGlobalDispatcher(mockAgent);

const mockedFileMeta = {
  url: `${BASE_URL}/storeid/foo-id.txt`,
  size: 12345,
  uploadedAt: '2023-05-04T15:12:07.818Z',
  pathname: 'foo.txt',
  contentType: 'text/plain',
  contentDisposition: 'attachment; filename="foo.txt"',
};

describe('blob client', () => {
  let mockClient: Interceptable;

  beforeEach(() => {
    mockClient = mockAgent.get(BASE_URL);
    jest.resetAllMocks();
  });

  describe('put', () => {
    beforeEach(() => {
      mockClient = mockAgent.get(BASE_URL);
      jest.resetAllMocks();
    });

    it('should upload a file from the client', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, mockedFileMeta);

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
