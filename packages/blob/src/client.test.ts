import { type Interceptable, MockAgent, setGlobalDispatcher } from 'undici';
import { put } from './client';

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
    process.env.BLOB_READ_WRITE_TOKEN = 'TEST_TOKEN';
    mockClient = mockAgent.get(BASE_URL);
    jest.resetAllMocks();
  });

  describe('put', () => {
    it('should upload a file', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      let body = '';
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, (req) => {
          path = req.path;
          headers = req.headers as Record<string, string>;
          body = req.body as string;
          return mockedFileMeta;
        });

      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          token: 'vercel_blob_client_123_TEST_TOKEN',
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
      expect(path).toBe('/foo.txt');
      expect(headers.authorization).toEqual(
        'Bearer vercel_blob_client_123_TEST_TOKEN',
      );
      expect(body).toMatchInlineSnapshot(`"Test Body"`);
    });

    it('should upload a file with a custom content-type', async () => {
      let headers: Record<string, string> = {};

      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, (req) => {
          headers = req.headers as Record<string, string>;
          return mockedFileMeta;
        });

      await put('foo.txt', 'Test Body', {
        access: 'public',
        contentType: 'text/plain',
        token: 'vercel_blob_client_123_TEST_TOKEN',
      });
      expect(headers['x-content-type']).toEqual('text/plain');
    });

    it('should throw when calling `put()` with an invalid token', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(403, 'Invalid token');

      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          contentType: 'text/plain',
          token: 'vercel_blob_client_123_TEST__INVALID_TOKEN',
        }),
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource',
        ),
      );
    });

    it('should throw when calling `put()` with an BLOB_READ_WRITE_TOKEN', async () => {
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

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(500, 'Generic Error');
      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          contentType: 'text/plain',
          token: 'vercel_blob_client_123_TEST_TOKEN',
        }),
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please contact support@vercel.com',
        ),
      );
    });

    it('should fail when the filepath is missing', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, mockedFileMeta);

      await expect(
        put('', 'Test Body', {
          access: 'public',
          token: 'vercel_blob_client_123_TEST_TOKEN',
        }),
      ).rejects.toThrow(new Error('Vercel Blob: pathname is required'));
    });

    it('should fail when the body is missing', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, mockedFileMeta);

      await expect(
        put('path.txt', '', {
          access: 'public',
          token: 'vercel_blob_client_123_TEST_TOKEN',
        }),
      ).rejects.toThrow(new Error('Vercel Blob: body is required'));
    });

    it('should throw when uploading a private file', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, mockedFileMeta);

      await expect(
        put('foo.txt', 'Test Body', {
          // @ts-expect-error: access is only public for now, testing that a different value throws
          access: 'private',
        }),
      ).rejects.toThrow(new Error('Vercel Blob: access must be "public"'));
    });
  });
});
