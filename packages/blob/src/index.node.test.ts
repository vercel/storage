import type { IncomingMessage } from 'node:http';
import { type Interceptable, MockAgent, setGlobalDispatcher } from 'undici';
import {
  list,
  head,
  del,
  put,
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
  verifyCallbackSignature,
  handleClientUpload,
  type HeadBlobResult,
} from './index';

const BLOB_API_URL = 'https://blob.vercel-storage.com';
const BLOB_STORE_BASE_URL = 'https://storeId.public.blob.vercel-storage.com';

const mockedFileMeta = {
  url: `${BLOB_STORE_BASE_URL}/foo-id.txt`,
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
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    mockClient = mockAgent.get(BLOB_API_URL);
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

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).resolves
        .toMatchInlineSnapshot(`
              {
                "contentDisposition": "attachment; filename="foo.txt"",
                "contentType": "text/plain",
                "pathname": "foo.txt",
                "size": 12345,
                "uploadedAt": 2023-05-04T15:12:07.818Z,
                "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
              }
          `);
      expect(path).toEqual(
        '/?url=https%3A%2F%2FstoreId.public.blob.vercel-storage.com%2Ffoo-id.txt'
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

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).resolves.toEqual(
        null
      );
    });

    it('should throw when calling `head()` with an invalid token', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(403, 'Invalid token');

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource'
        )
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'GET',
        })
        .reply(500, 'Invalid token');

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please visit https://vercel.com/help'
        )
      );
    });

    it('should throw when the token is not set', async () => {
      process.env.BLOB_READ_WRITE_TOKEN = '';

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: No token found. Either configure the `BLOB_READ_WRITE_TOKEN` environment variable, or pass a `token` option to your calls.'
        )
      );
    });
  });

  describe('del', () => {
    it('should return null when calling `del()` with a single file path', async () => {
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
          return [mockedFileMeta.url];
        });

      await expect(
        del(`${BLOB_STORE_BASE_URL}/foo-id.txt`)
      ).resolves.toBeUndefined();

      expect(path).toEqual('/delete');
      expect(headers.authorization).toEqual('Bearer TEST_TOKEN');
      expect(body).toMatchInlineSnapshot(
        `"{"urls":["https://storeId.public.blob.vercel-storage.com/foo-id.txt"]}"`
      );
    });

    it('should return null Blob metadata when calling `del()` with multiple file paths', async () => {
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
          return [mockedFileMeta.url, mockedFileMeta.url];
        });

      await expect(
        del([
          `${BLOB_STORE_BASE_URL}/foo-id1.txt`,
          `${BLOB_STORE_BASE_URL}/foo-id2.txt`,
        ])
      ).resolves.toBeUndefined();
      expect(path).toEqual('/delete');
      expect(headers.authorization).toEqual('Bearer TEST_TOKEN');
      expect(body).toMatchInlineSnapshot(
        `"{"urls":["https://storeId.public.blob.vercel-storage.com/foo-id1.txt","https://storeId.public.blob.vercel-storage.com/foo-id2.txt"]}"`
      );
    });

    it('should throw when calling `del()` with an invalid token', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(403, 'Invalid token');

      await expect(del(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource'
        )
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(500, 'Invalid token');

      await expect(del(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please visit https://vercel.com/help'
        )
      );
    });
  });

  describe('list', () => {
    const mockedFileMetaList = {
      url: mockedFileMeta.url,
      pathname: mockedFileMeta.pathname,
      size: mockedFileMeta.size,
      uploadedAt: mockedFileMeta.uploadedAt,
    };

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
            blobs: [mockedFileMetaList, mockedFileMetaList],
            cursor: 'cursor-123',
            hasMore: true,
          };
        });

      await expect(
        list({ cursor: 'cursor-abc', limit: 10, prefix: 'test-prefix' })
      ).resolves.toMatchInlineSnapshot(`
        {
          "blobs": [
            {
              "pathname": "foo.txt",
              "size": 12345,
              "uploadedAt": 2023-05-04T15:12:07.818Z,
              "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
            },
            {
              "pathname": "foo.txt",
              "size": 12345,
              "uploadedAt": 2023-05-04T15:12:07.818Z,
              "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
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
          'Vercel Blob: Access denied, please provide a valid token for this resource'
        )
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
          'Vercel Blob: Unknown error, please visit https://vercel.com/help'
        )
      );
    });
  });

  describe('put', () => {
    const mockedFileMetaPut = {
      url: mockedFileMeta.url,
      pathname: mockedFileMeta.pathname,
      contentType: mockedFileMeta.contentType,
      contentDisposition: mockedFileMeta.contentDisposition,
    };

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
          return mockedFileMetaPut;
        });

      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          token: 'NEW_TOKEN',
        })
      ).resolves.toMatchInlineSnapshot(`
        {
          "contentDisposition": "attachment; filename="foo.txt"",
          "contentType": "text/plain",
          "pathname": "foo.txt",
          "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
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
          return mockedFileMetaPut;
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
        })
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource'
        )
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
        })
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please visit https://vercel.com/help'
        )
      );
    });

    it('should fail when the filepath is missing', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, mockedFileMetaPut);

      await expect(
        put('', 'Test Body', {
          access: 'public',
        })
      ).rejects.toThrow(new Error('Vercel Blob: pathname is required'));
    });

    it('should fail when the body is missing', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, mockedFileMetaPut);

      await expect(
        put('path.txt', '', {
          access: 'public',
        })
      ).rejects.toThrow(new Error('Vercel Blob: body is required'));
    });

    it('should throw when uploading a private file', async () => {
      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, mockedFileMetaPut);

      await expect(
        put('foo.txt', 'Test Body', {
          // @ts-expect-error: access is only public for now, testing that a different value throws
          access: 'private',
        })
      ).rejects.toThrow(new Error('Vercel Blob: access must be "public"'));
    });

    it('sets the correct header when using the addRandomSuffix option', async () => {
      let headers: Record<string, string> = {};

      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, (req) => {
          headers = req.headers as Record<string, string>;
          return mockedFileMetaPut;
        });

      await put('foo.txt', 'Test Body', {
        access: 'public',
        addRandomSuffix: false,
      });
      expect(headers['x-add-random-suffix']).toEqual('0');
    });

    it('sets the correct header when using the cacheControlMaxAge option', async () => {
      let headers: Record<string, string> = {};

      mockClient
        .intercept({
          path: () => true,
          method: 'PUT',
        })
        .reply(200, (req) => {
          headers = req.headers as Record<string, string>;
          return mockedFileMetaPut;
        });

      await put('foo.txt', 'Test Body', {
        access: 'public',
        cacheControlMaxAge: 60,
      });
      expect(headers['x-cache-control-max-age']).toEqual('60');
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
    test('should generate a client token with the correct payload', async () => {
      const uploadToken = await generateClientTokenFromReadWriteToken({
        pathname: 'foo.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
          metadata: JSON.stringify({ foo: 'bar' }),
        },
        token: 'vercel_blob_client_123456789_TEST_TOKEN',
      });

      expect(uploadToken).toEqual(
        'vercel_blob_client_123456789_YWVlNmY1ZjVkZGU5YWZiYjczOGE1YmM0ZTNiOGFjNTI3MGNlMTJhOTNiNDc1YTlmZjBmYjkyZTFlZWVhNGE2OS5leUp3WVhSb2JtRnRaU0k2SW1admJ5NTBlSFFpTENKdmJsVndiRzloWkVOdmJYQnNaWFJsWkNJNmV5SmpZV3hzWW1GamExVnliQ0k2SW1oMGRIQnpPaTh2WlhoaGJYQnNaUzVqYjIwaUxDSnRaWFJoWkdGMFlTSTZJbnRjSW1admIxd2lPbHdpWW1GeVhDSjlJbjBzSW5aaGJHbGtWVzUwYVd3aU9qRTJOekkxTXpFeU16QXdNREI5'
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
        })
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
        })
      ).toBeFalsy();
    });
  });

  describe('handleClientUpload', () => {
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));
    });
    test('should return client token when called with blob.generate-client-token', async () => {
      const token = 'vercel_blob_client_123456789_TEST_TOKEN';
      const spy = jest.fn();
      const jsonResponse = await handleClientUpload({
        token,
        request: {
          headers: { 'x-vercel-signature': '123' },
        } as unknown as IncomingMessage,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            callbackUrl: 'https://example.com',
          },
        },
        onBeforeGenerateToken: async (pathname) => {
          await Promise.resolve();
          return Promise.resolve({
            metadata: pathname,
          });
        },
        onUploadCompleted: async (body) => {
          await Promise.resolve();
          spy.call(body);
        },
      });
      expect(jsonResponse).toEqual({
        clientToken:
          'vercel_blob_client_123456789_MThhNDRkM2VjZDliYmY3YWE3YmRlNTRiNGMwOTdjNDhiOGQ0NzI3M2NhMmIxOGY2OTEyNTZmOTVkZGJlZjMwNC5leUp0WlhSaFpHRjBZU0k2SW01bGQyWnBiR1V1ZEhoMElpd2ljR0YwYUc1aGJXVWlPaUp1WlhkbWFXeGxMblI0ZENJc0ltOXVWWEJzYjJGa1EyOXRjR3hsZEdWa0lqcDdJbU5oYkd4aVlXTnJWWEpzSWpvaWFIUjBjSE02THk5bGVHRnRjR3hsTG1OdmJTSXNJbTFsZEdGa1lYUmhJam9pYm1WM1ptbHNaUzUwZUhRaWZTd2lkbUZzYVdSVmJuUnBiQ0k2TVRZM01qVXpNVEl6TURBd01IMD0=',
        type: 'blob.generate-client-token',
      });
      expect(spy).not.toHaveBeenCalled();
      expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- Either the test is incomplete, or we're messing up with TS
        getPayloadFromClientToken((jsonResponse as any).clientToken)
      ).toEqual({
        metadata: 'newfile.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
          metadata: 'newfile.txt',
        },
        pathname: 'newfile.txt',
        validUntil: 1672531230000,
      });
    });

    test('should run onCompleted when called with blob.upload-completed', async () => {
      const token = 'vercel_blob_client_123456789_TEST_TOKEN';
      const spy = jest.fn();

      expect(
        await handleClientUpload({
          token,
          request: {
            headers: {
              'x-vercel-signature':
                '973bfbb82f375e9360675b8271b16e1f44e3dd8c3996560b65c0f0fb3316def2',
            },
          } as unknown as IncomingMessage,
          body: {
            type: 'blob.upload-completed',
            payload: {
              blob: { pathname: 'newfile.txt' } as HeadBlobResult,
              metadata: 'custom-metadata',
            },
          },
          onBeforeGenerateToken: async (pathname) => {
            await Promise.resolve();
            return {
              metadata: pathname,
            };
          },
          onUploadCompleted: spy,
        })
      ).toEqual({
        response: 'ok',
        type: 'blob.upload-completed',
      });
      expect(spy).toHaveBeenCalledWith({
        blob: { pathname: 'newfile.txt' } as HeadBlobResult,
        metadata: 'custom-metadata',
      });
    });
  });
});
