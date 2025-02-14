import undici from 'undici';
import {
  completeMultipartUpload,
  createMultipartUpload,
  uploadPart,
  upload,
  createMultipartUploader,
  put,
} from './client';

describe('client', () => {
  let requestId = '';

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN =
      'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

    jest.useFakeTimers({ advanceTimers: true });

    jest.resetAllMocks();
    jest.restoreAllMocks();

    jest.clearAllMocks();

    jest.spyOn(global.Math, 'random').mockReturnValue(Math.random());
    requestId = Math.random().toString(16).slice(2);
  });

  afterEach(() => {
    jest.spyOn(global.Math, 'random').mockRestore();
  });

  describe('upload()', () => {
    it('should upload a file from the client', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'blob.generate-client-token',
                clientToken: 'vercel_blob_client_fake_123',
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
      );

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
        'https://blob.vercel-storage.com/?pathname=foo.txt',
        {
          body: 'Test file data',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_123',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
          },
          method: 'PUT',
        },
      );
    });
  });

  describe('multipart upload', () => {
    beforeEach(() => {
      process.env.BLOB_READ_WRITE_TOKEN =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      jest.resetAllMocks();
      jest.restoreAllMocks();

      // freeze Math.random
      jest.spyOn(global.Math, 'random').mockReturnValue(Math.random());
      requestId = Math.random().toString(16).slice(2);
    });

    afterEach(() => {
      jest.spyOn(global.Math, 'random').mockRestore();
    });

    it('should upload a file using the manual functions', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ key: 'key', uploadId: 'uploadId' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ etag: 'etag1' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ etag: 'etag2' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                url: `https://storeId.public.blob.vercel-storage.com/foo.txt`,
                pathname: 'foo.txt',
                contentType: 'text/plain',
                contentDisposition: 'attachment; filename="foo.txt"',
              }),
          }),
      );

      const pathname = 'foo.txt';
      const token = 'vercel_blob_client_fake_token_for_test';

      const { uploadId, key } = await createMultipartUpload(pathname, {
        access: 'public',
        token,
      });
      expect(uploadId).toEqual('uploadId');
      expect(key).toEqual('key');

      const part1 = await uploadPart(pathname, 'data1', {
        access: 'public',
        key: 'key',
        partNumber: 1,
        uploadId: 'uploadId',
        token,
      });

      expect(part1).toEqual({
        etag: 'etag1',
        partNumber: 1,
      });

      const part2 = await uploadPart(pathname, 'data2', {
        access: 'public',
        key: 'key',
        partNumber: 2,
        uploadId: 'uploadId',
        token,
      });
      expect(part2).toEqual({
        etag: 'etag2',
        partNumber: 2,
      });

      const blob = await completeMultipartUpload(pathname, [part1, part2], {
        access: 'public',
        key: 'key',
        uploadId: 'uploadId',
        token,
      });
      expect(blob).toEqual({
        contentDisposition: 'attachment; filename="foo.txt"',
        contentType: 'text/plain',
        pathname: 'foo.txt',
        url: 'https://storeId.public.blob.vercel-storage.com/foo.txt',
      });

      expect(fetchMock).toHaveBeenCalledTimes(4);

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'create',
          },
          method: 'POST',
          signal: undefined,
        },
      );
      const internalAbortSignal = new AbortController().signal;
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          body: 'data1',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '1',
          },
          method: 'POST',
          signal: internalAbortSignal,
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          body: 'data2',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '2',
          },
          method: 'POST',
          signal: internalAbortSignal,
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          body: JSON.stringify([
            { etag: 'etag1', partNumber: 1 },
            { etag: 'etag2', partNumber: 2 },
          ]),
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'complete',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
          },
          method: 'POST',
          signal: undefined,
        },
      );
    });

    it('should upload a file using the uploader', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ key: 'key', uploadId: 'uploadId' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ etag: 'etag1' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () => Promise.resolve({ etag: 'etag2' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                url: `https://storeId.public.blob.vercel-storage.com/foo.txt`,
                pathname: 'foo.txt',
                contentType: 'text/plain',
                contentDisposition: 'attachment; filename="foo.txt"',
              }),
          }),
      );

      const pathname = 'foo.txt';
      const token = 'vercel_blob_client_fake_token_for_test';

      const uploader = await createMultipartUploader(pathname, {
        access: 'public',
        token,
      });
      expect(uploader.uploadId).toEqual('uploadId');
      expect(uploader.key).toEqual('key');

      const part1 = await uploader.uploadPart(1, 'data1');
      expect(part1).toEqual({
        etag: 'etag1',
        partNumber: 1,
      });

      const part2 = await uploader.uploadPart(2, 'data2');
      expect(part2).toEqual({
        etag: 'etag2',
        partNumber: 2,
      });

      const blob = await uploader.complete([part1, part2]);
      expect(blob).toEqual({
        contentDisposition: 'attachment; filename="foo.txt"',
        contentType: 'text/plain',
        pathname: 'foo.txt',
        url: 'https://storeId.public.blob.vercel-storage.com/foo.txt',
      });

      expect(fetchMock).toHaveBeenCalledTimes(4);

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'create',
          },
          method: 'POST',
          signal: undefined,
        },
      );
      const internalAbortSignal = new AbortController().signal;
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          body: 'data1',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '1',
          },
          method: 'POST',
          signal: internalAbortSignal,
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          body: 'data2',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '2',
          },
          method: 'POST',
          signal: internalAbortSignal,
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        'https://blob.vercel-storage.com/mpu?pathname=foo.txt',
        {
          body: JSON.stringify([
            { etag: 'etag1', partNumber: 1 },
            { etag: 'etag2', partNumber: 2 },
          ]),
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': `fake:${Date.now()}:${requestId}`,
            'x-api-version': '9',
            'x-mpu-action': 'complete',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
          },
          method: 'POST',
          signal: undefined,
        },
      );
    });

    it('should reject incorrect body in uploader.uploadPart()', async () => {
      // Mock the createMultipartUploader to return a minimal uploader object
      jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ key: 'key', uploadId: 'uploadId' }),
        }),
      );

      const uploader = await createMultipartUploader('foo.txt', {
        access: 'public',
        token: 'vercel_blob_client_fake_token_for_test',
      });

      await expect(() =>
        // @ts-expect-error: Runtime check for DX
        uploader.uploadPart(1, { file: 'value' }),
      ).rejects.toThrow(
        new Error(
          "Vercel Blob: Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload.",
        ),
      );
    });
  });

  describe('rejects when body is incorrect', () => {
    type TestCase = [string, () => Promise<unknown>];

    const testCases: TestCase[] = [
      [
        'put()',
        () =>
          put(
            'foo.txt',
            // @ts-expect-error: Runtime check for DX
            { file: 'value' },
            { access: 'public' },
          ),
      ],
      [
        'multipart put()',
        () =>
          put(
            'foo.txt',
            // @ts-expect-error: Runtime check for DX
            { file: 'value' },
            {
              access: 'public',
              multipart: true,
            },
          ),
      ],
      [
        'upload()',
        () =>
          upload(
            'foo.txt',
            // @ts-expect-error: Runtime check for DX
            { file: 'value' },
            {
              access: 'public',
              handleUploadUrl: '/api/upload',
            },
          ),
      ],
      [
        'uploadPart()',
        () =>
          uploadPart(
            'foo.txt',
            // @ts-expect-error: Runtime check for DX
            { file: 'value' },
            {
              access: 'public',
              key: 'foo.txt',
              uploadId: '1',
              partNumber: 1,
              token: 'vercel_blob_client_fake_123',
            },
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
});
