import { BlobRequestAbortedError, BlobServiceNotAvailable } from './api';
import {
  list,
  head,
  del,
  put,
  copy,
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
} from './index';

const BLOB_STORE_BASE_URL = 'https://storeId.public.blob.vercel-storage.com';

const mockedFileMeta = {
  url: `${BLOB_STORE_BASE_URL}/foo-id.txt`,
  downloadUrl: `${BLOB_STORE_BASE_URL}/foo-id.txt?download=1`,
  size: 12345,
  uploadedAt: '2023-05-04T15:12:07.818Z',
  pathname: 'foo.txt',
  contentType: 'text/plain',
  contentDisposition: 'attachment; filename="foo.txt"',
};

describe('blob client', () => {
  const realFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN =
      'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
    jest.resetAllMocks();

    process.env.VERCEL_BLOB_RETRIES = '0';
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    fetchMock.mockClear();
  });

  describe('head', () => {
    it('should return Blob metadata when calling `head()`', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      fetchMock.mockImplementationOnce((input: string, init: RequestInit) => {
        const url = new URL(input);

        path = url.pathname + url.search;
        headers = init.headers as Record<string, string>;

        return Promise.resolve(Response.json(mockedFileMeta));
      });

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).resolves
        .toMatchInlineSnapshot(`
              {
                "cacheControl": undefined,
                "contentDisposition": "attachment; filename="foo.txt"",
                "contentType": "text/plain",
                "downloadUrl": "https://storeId.public.blob.vercel-storage.com/foo-id.txt?download=1",
                "pathname": "foo.txt",
                "size": 12345,
                "uploadedAt": 2023-05-04T15:12:07.818Z,
                "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
              }
          `);
      expect(path).toEqual(
        '/api/blob?url=https%3A%2F%2FstoreId.public.blob.vercel-storage.com%2Ffoo-id.txt',
      );
      expect(headers.authorization).toEqual(
        'Bearer vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
      );
    });

    it('should return null when calling `head()` with an url that does not exist', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 404,
        ok: false,
        json: () =>
          Promise.resolve({
            error: { code: 'not_found', message: 'Not found' },
          }),
      });

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error('Vercel Blob: The requested blob does not exist'),
      );
    });

    it('should throw when calling `head()` with an invalid token', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: () =>
          Promise.resolve({
            error: { code: 'forbidden', message: 'Forbidden' },
          }),
      });

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource.',
        ),
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'unknown_error' } }),
      });

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please visit https://vercel.com/help.',
        ),
      );
    });

    it('should throw when the token is not set', async () => {
      process.env.BLOB_READ_WRITE_TOKEN = '';

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: No token found. Either configure the `BLOB_READ_WRITE_TOKEN` environment variable, or pass a `token` option to your calls.',
        ),
      );
    });

    it('should throw when store is suspended', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'store_suspended' } }),
      });

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error('Vercel Blob: This store has been suspended.'),
      );
    });

    it('should throw when store does NOT exist', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'store_not_found' } }),
      });

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error('Vercel Blob: This store does not exist.'),
      );
    });

    it('should throw when service unavailable', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 502,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'service_unavailable' } }),
      });

      await expect(head(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new BlobServiceNotAvailable(),
      );
    });
  });

  describe('del', () => {
    it('should return null when calling `del()` with a single file path', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      let body = '';
      fetchMock.mockImplementationOnce((input: string, init: RequestInit) => {
        const url = new URL(input);

        path = url.pathname + url.search;
        headers = init.headers as Record<string, string>;
        body = init.body as string;

        return Promise.resolve(Response.json(mockedFileMeta));
      });

      await expect(
        del(`${BLOB_STORE_BASE_URL}/foo-id.txt`),
      ).resolves.toBeUndefined();

      expect(path).toEqual('/api/blob/delete');
      expect(headers.authorization).toEqual(
        'Bearer vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
      );
      expect(body).toMatchInlineSnapshot(
        `"{"urls":["https://storeId.public.blob.vercel-storage.com/foo-id.txt"]}"`,
      );
    });

    it('should return null Blob metadata when calling `del()` with multiple file paths', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      let body = '';
      fetchMock.mockImplementationOnce((input: string, init: RequestInit) => {
        const url = new URL(input);

        path = url.pathname + url.search;
        headers = init.headers as Record<string, string>;
        body = init.body as string;

        return Promise.resolve(Response.json(mockedFileMeta));
      });

      await expect(
        del([
          `${BLOB_STORE_BASE_URL}/foo-id1.txt`,
          `${BLOB_STORE_BASE_URL}/foo-id2.txt`,
        ]),
      ).resolves.toBeUndefined();
      expect(path).toEqual('/api/blob/delete');
      expect(headers.authorization).toEqual(
        'Bearer vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
      );
      expect(body).toMatchInlineSnapshot(
        `"{"urls":["https://storeId.public.blob.vercel-storage.com/foo-id1.txt","https://storeId.public.blob.vercel-storage.com/foo-id2.txt"]}"`,
      );
    });

    it('should throw when calling `del()` with an invalid token', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'forbidden' } }),
      });

      await expect(del(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource.',
        ),
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'unknown_error' } }),
      });

      await expect(del(`${BLOB_STORE_BASE_URL}/foo-id.txt`)).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please visit https://vercel.com/help.',
        ),
      );
    });
  });

  describe('list', () => {
    const mockedFileMetaList = {
      url: mockedFileMeta.url,
      downloadUrl: mockedFileMeta.downloadUrl,
      pathname: mockedFileMeta.pathname,
      size: mockedFileMeta.size,
      uploadedAt: mockedFileMeta.uploadedAt,
    };

    it('should return a list of Blob metadata when calling `list()`', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      fetchMock.mockImplementationOnce((input: string, init: RequestInit) => {
        const url = new URL(input);

        path = url.pathname + url.search;
        headers = init.headers as Record<string, string>;

        return Promise.resolve(
          Response.json({
            blobs: [mockedFileMetaList, mockedFileMetaList],
            cursor: 'cursor-123',
            hasMore: true,
          }),
        );
      });

      await expect(
        list({ cursor: 'cursor-abc', limit: 10, prefix: 'test-prefix' }),
      ).resolves.toMatchInlineSnapshot(`
        {
          "blobs": [
            {
              "downloadUrl": "https://storeId.public.blob.vercel-storage.com/foo-id.txt?download=1",
              "pathname": "foo.txt",
              "size": 12345,
              "uploadedAt": 2023-05-04T15:12:07.818Z,
              "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
            },
            {
              "downloadUrl": "https://storeId.public.blob.vercel-storage.com/foo-id.txt?download=1",
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
      expect(path).toBe(
        '/api/blob?limit=10&prefix=test-prefix&cursor=cursor-abc',
      );
      expect(headers.authorization).toEqual(
        'Bearer vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
      );
    });

    it('should throw when calling `list()` with an invalid token', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'forbidden' } }),
      });

      await expect(list()).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource.',
        ),
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'unknown_error' } }),
      });

      await expect(list()).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please visit https://vercel.com/help.',
        ),
      );
    });

    it('list should pass the mode param and return folders array', async () => {
      let path: string | null = null;
      fetchMock.mockImplementationOnce((input: string) => {
        const url = new URL(input);
        path = url.pathname + url.search;

        return Promise.resolve(
          Response.json({
            blobs: [mockedFileMetaList],
            folders: ['foo', 'bar'],
            hasMore: false,
          }),
        );
      });

      await expect(list({ mode: 'folded' })).resolves.toMatchInlineSnapshot(`
        {
          "blobs": [
            {
              "downloadUrl": "https://storeId.public.blob.vercel-storage.com/foo-id.txt?download=1",
              "pathname": "foo.txt",
              "size": 12345,
              "uploadedAt": 2023-05-04T15:12:07.818Z,
              "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
            },
          ],
          "cursor": undefined,
          "folders": [
            "foo",
            "bar",
          ],
          "hasMore": false,
        }
      `);

      expect(path).toBe('/api/blob?mode=folded');
    });
  });

  describe('put', () => {
    const mockedFileMetaPut = {
      url: mockedFileMeta.url,
      downloadUrl: mockedFileMeta.downloadUrl,
      pathname: mockedFileMeta.pathname,
      contentType: mockedFileMeta.contentType,
      contentDisposition: mockedFileMeta.contentDisposition,
    };

    it('has an onUploadProgress option', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockedFileMetaPut),
      });

      const onUploadProgress = jest.fn();

      await expect(
        put('progress.txt', 'Test Body', {
          access: 'public',
          onUploadProgress,
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
      expect(onUploadProgress).toHaveBeenCalledTimes(1);
    });

    it('should upload a file with a custom token', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      let body = '';
      fetchMock.mockImplementationOnce((input: string, init: RequestInit) => {
        const url = new URL(input);

        path = url.pathname + url.search;
        headers = init.headers as Record<string, string>;
        body = init.body as string;

        return Promise.resolve(Response.json(mockedFileMetaPut));
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
          "downloadUrl": "https://storeId.public.blob.vercel-storage.com/foo-id.txt?download=1",
          "pathname": "foo.txt",
          "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
        }
      `);
      expect(path).toBe('/api/blob/?pathname=foo.txt');
      expect(headers.authorization).toEqual('Bearer NEW_TOKEN');
      expect(body).toMatchInlineSnapshot(`"Test Body"`);
    });

    it('should upload a file with a custom content-type', async () => {
      let headers: Record<string, string> = {};
      fetchMock.mockImplementationOnce((_, init: RequestInit) => {
        headers = init.headers as Record<string, string>;

        return Promise.resolve(Response.json(mockedFileMeta));
      });

      await put('foo.txt', 'Test Body', {
        access: 'public',
        contentType: 'text/plain',
      });
      expect(headers['x-content-type']).toEqual('text/plain');
    });

    it('should throw when calling `put()` with an invalid token', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: () => Promise.resolve({ error: { code: 'forbidden' } }),
      });

      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          contentType: 'text/plain',
        }),
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: Access denied, please provide a valid token for this resource.',
        ),
      );
    });

    it('should throw a generic error when the worker returns a 500 status code', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 500,
        ok: false,
      });
      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          contentType: 'text/plain',
        }),
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: Unknown error, please visit https://vercel.com/help.',
        ),
      );
    });

    it('should fail when the filepath is missing', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockedFileMetaPut),
      });

      await expect(
        put('', 'Test Body', {
          access: 'public',
        }),
      ).rejects.toThrow(new Error('Vercel Blob: pathname is required'));
    });

    it('should fail when the body is missing', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockedFileMetaPut),
      });

      await expect(
        put('path.txt', '', {
          access: 'public',
        }),
      ).rejects.toThrow(new Error('Vercel Blob: body is required'));
    });

    it('should throw when uploading a private file', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockedFileMetaPut),
      });

      await expect(
        put('foo.txt', 'Test Body', {
          // @ts-expect-error: access is only public for now, testing that a different value throws
          access: 'private',
        }),
      ).rejects.toThrow(new Error('Vercel Blob: access must be "public"'));
    });

    it('sets the correct header when using the addRandomSuffix option', async () => {
      let headers: Record<string, string> = {};
      fetchMock.mockImplementationOnce((input, init) => {
        headers = init.headers as Record<string, string>;

        return Promise.resolve(Response.json(mockedFileMeta));
      });

      await put('foo.txt', 'Test Body', {
        access: 'public',
        addRandomSuffix: false,
      });
      expect(headers['x-add-random-suffix']).toEqual('0');
    });

    it('sets the correct header when using the cacheControlMaxAge option', async () => {
      let headers: Record<string, string> = {};
      fetchMock.mockImplementationOnce((input, init) => {
        headers = init.headers as Record<string, string>;

        return Promise.resolve(Response.json(mockedFileMeta));
      });

      await put('foo.txt', 'Test Body', {
        access: 'public',
        cacheControlMaxAge: 60,
      });
      expect(headers['x-cache-control-max-age']).toEqual('60');
    });

    it('throws when filepath is too long', async () => {
      await expect(
        put('a'.repeat(951), 'Test Body', {
          access: 'public',
        }),
      ).rejects.toThrow(
        new Error('Vercel Blob: pathname is too long, maximum length is 950'),
      );
    });

    it('throws when pathname contains //', async () => {
      await expect(
        put('foo//bar.txt', 'Test Body', {
          access: 'public',
        }),
      ).rejects.toThrow(
        new Error(
          'Vercel Blob: pathname cannot contain "//", please encode it if needed',
        ),
      );
    });

    const table: [string, (signal: AbortSignal) => Promise<unknown>][] = [
      [
        'put',
        (abortSignal) =>
          put('file.txt', 'Hello World!', { access: 'public', abortSignal }),
      ],
      [
        'multipart put',
        (abortSignal) =>
          put('file.txt', 'Big file', {
            access: 'public',
            abortSignal,
            multipart: true,
          }),
      ],
      [
        'create multipart upload',
        (abortSignal) =>
          createMultipartUpload('big-file.txt', {
            access: 'public',
            abortSignal,
          }),
      ],
      [
        'upload part',
        (abortSignal) =>
          uploadPart('big-file.txt', 'Big file', {
            access: 'public',
            key: 'big-file.txt',
            uploadId: '1',
            partNumber: 1,
            abortSignal,
          }),
      ],
      [
        'complete multipart upload',
        (abortSignal) =>
          completeMultipartUpload('big-file.txt', [], {
            access: 'public',
            key: 'big-file.txt',
            uploadId: '1',
            abortSignal,
          }),
      ],
      [
        'del',
        (abortSignal) =>
          del('https://mystore.public.blob.vercel-storage.com/file.txt', {
            abortSignal,
          }),
      ],
      ['list', (abortSignal) => list({ abortSignal })],
      [
        'copy',
        (abortSignal) =>
          copy('from.txt', 'destination.txt', {
            access: 'public',
            abortSignal,
          }),
      ],
      [
        'head',
        (abortSignal) =>
          head('https://mystore.public.blob.vercel-storage.com/file.txt', {
            abortSignal,
          }),
      ],
    ];

    it.each(table)(
      'cancels requests with an abort controller: %s',
      async (_, operation) => {
        await expect(async () => {
          globalThis.fetch = realFetch;

          const controller = new AbortController();
          const promise = operation(controller.signal);

          controller.abort();

          await promise;
        }).rejects.toThrow(BlobRequestAbortedError);
      },
    );
  });

  // Some folks are trying to upload plain objects which cannot work, example: https://github.com/vercel/storage/issues/637
  describe('rejects when body is incorrect', () => {
    type TestCase = [string, () => Promise<unknown>];

    const testCases: TestCase[] = [
      [
        'put()',
        () =>
          // @ts-expect-error: Runtime check for DX
          put('foo.txt', { file: 'value' }, { access: 'public' }),
      ],
      [
        'multipart put()',
        () =>
          put(
            'foo.txt',
            // @ts-expect-error: Runtime check for DX
            { file: 'value' },
            { access: 'public', multipart: true },
          ),
      ],
      [
        'uploadPart()',
        () =>
          uploadPart(
            'foo.txt',
            // @ts-expect-error: Runtime check for DX
            { file: 'value' },
            { access: 'public', key: 'foo.txt', uploadId: '1', partNumber: 1 },
          ),
      ],
    ];

    it.each(testCases)('on %s', async (_, operation) => {
      await expect(operation).rejects.toThrow(
        new Error(
          "Vercel Blob: Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload.",
        ),
      );
    });
  });

  describe('copy', () => {
    it('throws when filepath is too long', async () => {
      await expect(
        copy('source', 'a'.repeat(951), {
          access: 'public',
        }),
      ).rejects.toThrow(
        new Error('Vercel Blob: pathname is too long, maximum length is 950'),
      );
    });
  });
});
