import { type Interceptable, MockAgent, setGlobalDispatcher } from 'undici';
import {
  list,
  head,
  del,
  put,
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
  verifyCallbackSignature,
} from './index';

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

  describe('head', () => {
    it('should return Blob metadata when calling `head()`', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(200, (req) => {
          path = req.path;
          headers = req.headers as Record<string, string>;
          return mockedFileMeta;
        });

      await expect(head(`${BASE_URL}/storeid/foo-id.txt`)).resolves
        .toMatchInlineSnapshot(`
              {
                "contentDisposition": "attachment; filename="foo.txt"",
                "contentType": "text/plain",
                "pathname": "foo.txt",
                "size": 12345,
                "uploadedAt": 2023-05-04T15:12:07.818Z,
                "url": "https://blob.vercel-storage.com/storeid/foo-id.txt",
              }
          `);
      expect(path).toEqual(
        '/?url=https%3A%2F%2Fblob.vercel-storage.com%2Fstoreid%2Ffoo-id.txt',
      );
      expect(headers.authorization).toEqual('Bearer TEST_TOKEN');
    });

    it('should return null when calling `head()` with an url that does not exist', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(404, 'Not found');

      await expect(head(`${BASE_URL}/storeid/foo-id.txt`)).resolves.toEqual(
        null,
      );
    });

    it('should throw when calling `head()` with an invalid token', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(403, 'Invalid token');

      await expect(head(`${BASE_URL}/storeid/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource',
        ),
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(500, 'Invalid token');

      await expect(head(`${BASE_URL}/storeid/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please contact support@vercel.com',
        ),
      );
    });

    it('should throw when the token is not set', async () => {
      process.env.BLOB_READ_WRITE_TOKEN = '';

      await expect(head(`${BASE_URL}/storeid/foo-id.txt`)).rejects.toThrow(
        new Error(
          'BLOB_READ_WRITE_TOKEN environment variable is not set. Please set it to your write token.',
        ),
      );
    });
  });

  describe('del', () => {
    it('should return Blob metadata when calling `del()` with a single file path', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      let body = '';
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, (req) => {
          path = req.path;
          headers = req.headers as Record<string, string>;
          body = req.body as string;
          return [mockedFileMeta];
        });

      await expect(del(`${BASE_URL}/storeid/foo-id.txt`)).resolves
        .toMatchInlineSnapshot(`
        {
          "contentDisposition": "attachment; filename="foo.txt"",
          "contentType": "text/plain",
          "pathname": "foo.txt",
          "size": 12345,
          "uploadedAt": 2023-05-04T15:12:07.818Z,
          "url": "https://blob.vercel-storage.com/storeid/foo-id.txt",
        }
      `);

      expect(path).toEqual('/delete');
      expect(headers.authorization).toEqual('Bearer TEST_TOKEN');
      expect(body).toMatchInlineSnapshot(
        '"{"urls":["https://blob.vercel-storage.com/storeid/foo-id.txt"]}"',
      );
    });

    it('should return multiple Blob metadata when calling `del()` with multiple file paths', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      let body = '';
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, (req) => {
          path = req.path;
          headers = req.headers as Record<string, string>;
          body = req.body as string;
          return [mockedFileMeta, mockedFileMeta];
        });

      await expect(
        del([
          `${BASE_URL}/storeid/foo-id1.txt`,
          `${BASE_URL}/storeid/foo-id2.txt`,
        ]),
      ).resolves.toMatchInlineSnapshot(`
        [
          {
            "contentDisposition": "attachment; filename="foo.txt"",
            "contentType": "text/plain",
            "pathname": "foo.txt",
            "size": 12345,
            "uploadedAt": 2023-05-04T15:12:07.818Z,
            "url": "https://blob.vercel-storage.com/storeid/foo-id.txt",
          },
          {
            "contentDisposition": "attachment; filename="foo.txt"",
            "contentType": "text/plain",
            "pathname": "foo.txt",
            "size": 12345,
            "uploadedAt": 2023-05-04T15:12:07.818Z,
            "url": "https://blob.vercel-storage.com/storeid/foo-id.txt",
          },
        ]
      `);
      expect(path).toEqual('/delete');
      expect(headers.authorization).toEqual('Bearer TEST_TOKEN');
      expect(body).toMatchInlineSnapshot(
        `"{"urls":["https://blob.vercel-storage.com/storeid/foo-id1.txt","https://blob.vercel-storage.com/storeid/foo-id2.txt"]}"`,
      );
    });

    it('should return null when the file is not found', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, [null]);

      await expect(
        del(`${BASE_URL}/storeid/foo-id2.txt`),
      ).resolves.toMatchInlineSnapshot(`null`);
    });

    it('should return null when multiple files are not found', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, [null, null]);

      await expect(
        del([
          `${BASE_URL}/storeid/foo-id2.txt`,
          `${BASE_URL}/storeid/foo-id2.txt`,
        ]),
      ).resolves.toMatchInlineSnapshot(`
        [
          null,
          null,
        ]
      `);
    });

    it('should throw when calling `del()` with an invalid token', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(403, 'Invalid token');

      await expect(del(`${BASE_URL}/storeid/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource',
        ),
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(500, 'Invalid token');

      await expect(del(`${BASE_URL}/storeid/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please contact support@vercel.com',
        ),
      );
    });
  });

  describe('list', () => {
    it('should return a list of Blob metadata when calling `list()`', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(200, (req) => {
          path = req.path;
          headers = req.headers as Record<string, string>;
          return {
            blobs: [mockedFileMeta, mockedFileMeta],
            cursor: 'cursor-123',
            hasMore: true,
          };
        });

      await expect(
        list({ cursor: 'cursor-abc', limit: 10, prefix: 'test-prefix' }),
      ).resolves.toMatchInlineSnapshot(`
        {
          "blobs": [
            {
              "contentDisposition": "attachment; filename="foo.txt"",
              "contentType": "text/plain",
              "pathname": "foo.txt",
              "size": 12345,
              "uploadedAt": 2023-05-04T15:12:07.818Z,
              "url": "https://blob.vercel-storage.com/storeid/foo-id.txt",
            },
            {
              "contentDisposition": "attachment; filename="foo.txt"",
              "contentType": "text/plain",
              "pathname": "foo.txt",
              "size": 12345,
              "uploadedAt": 2023-05-04T15:12:07.818Z,
              "url": "https://blob.vercel-storage.com/storeid/foo-id.txt",
            },
          ],
          "cursor": "cursor-123",
          "hasMore": true,
        }
      `);
      expect(path).toBe('/?limit=10&prefix=test-prefix&cursor=cursor-abc');
      expect(headers.authorization).toEqual('Bearer TEST_TOKEN');
    });

    it('should throw when calling `list()` with an invalid token', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(403, 'Invalid token');

      await expect(list()).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource',
        ),
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(500, 'Invalid token');
      await expect(list()).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please contact support@vercel.com',
        ),
      );
    });
  });

  describe('put', () => {
    it('should upload a file with a custom token', async () => {
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
          token: 'NEW_TOKEN',
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
      expect(headers.authorization).toEqual('Bearer NEW_TOKEN');
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
        }),
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource',
        ),
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

  describe('client put', () => {
    beforeEach(() => {
      process.env.BLOB_READ_WRITE_TOKEN = undefined;
      mockClient = mockAgent.get(BASE_URL);
      jest.resetAllMocks();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      global.window = {} as any;
    });
    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      global.window = undefined as any;
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

  describe('generateClientTokenFromReadWriteToken', () => {
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));
    });
    test('should generate an upload token with the correct payload', async () => {
      const uploadToken = await generateClientTokenFromReadWriteToken({
        pathname: 'foo.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
          metadata: JSON.stringify({ foo: 'bar' }),
        },
        token: 'vercel_blob_client_123456789_TEST_TOKEN',
      });

      expect(uploadToken).toEqual(
        'vercel_blob_client_123456789_YWVlNmY1ZjVkZGU5YWZiYjczOGE1YmM0ZTNiOGFjNTI3MGNlMTJhOTNiNDc1YTlmZjBmYjkyZTFlZWVhNGE2OS5leUp3WVhSb2JtRnRaU0k2SW1admJ5NTBlSFFpTENKdmJsVndiRzloWkVOdmJYQnNaWFJsWkNJNmV5SmpZV3hzWW1GamExVnliQ0k2SW1oMGRIQnpPaTh2WlhoaGJYQnNaUzVqYjIwaUxDSnRaWFJoWkdGMFlTSTZJbnRjSW1admIxd2lPbHdpWW1GeVhDSjlJbjBzSW5aaGJHbGtWVzUwYVd3aU9qRTJOekkxTXpFeU16QXdNREI5',
      );

      expect(getPayloadFromClientToken(uploadToken)).toEqual({
        pathname: 'foo.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
          metadata: '{"foo":"bar"}',
        },
        validUntil: 1672531230000,
      });
    });
  });

  describe('verifyCallbackSignature', () => {
    test('should verify a webhook signature', async () => {
      const token = 'vercel_blob_client_123456789_TEST_TOKEN';
      const body = JSON.stringify({
        type: 'blob.upload-completed',
        payload: {
          blob: { pathname: 'text.txt' },
          metadata: 'custom-metadata',
        },
      });

      expect(
        await verifyCallbackSignature({
          token,
          body,
          signature:
            '3fac10916b6b4af8678e189a3843706ec8185162c15238f0557f113531969053',
        }),
      ).toBeTruthy();
    });

    test('should fail verifying an invalid signature', async () => {
      const token = 'vercel_blob_client_123456789_TEST_TOKEN';
      const body = JSON.stringify({
        type: 'blob.upload-completed',
        payload: {
          blob: { pathname: 'newfile.txt' },
          metadata: 'custom-metadata',
        },
      });

      expect(
        await verifyCallbackSignature({
          token,
          body,
          signature:
            '3fac10916b6b4af8678e189a3843706ec8185162c15238f0557f113531969053',
        }),
      ).toBeFalsy();
    });
  });
});
