import undici from 'undici';
import {
  completeMultipartUpload,
  createMultipartUpload,
  multipartUpload,
  upload,
  createMultipartUploader,
} from './client';

describe('client', () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN =
      'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

    jest.useFakeTimers({ advanceTimers: true });

    jest.resetAllMocks();
    jest.restoreAllMocks();

    jest.clearAllMocks();
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
                clientToken: 'fake-token-for-test',
              }),
          })
          .mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                url: `https://storeId.public.blob.vercel-storage.com/superfoo.txt`,
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
        'https://blob.vercel-storage.com/foo.txt',
        {
          body: 'Test file data',
          duplex: 'half',
          headers: {
            authorization: 'Bearer fake-token-for-test',
            'x-api-version': '6',
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

      const multiPartUpload = await createMultipartUpload(pathname, {
        access: 'public',
        token,
      });
      expect(multiPartUpload.uploadId).toEqual('uploadId');
      expect(multiPartUpload.key).toEqual('key');

      const part1 = await multipartUpload(pathname, 'data1', {
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

      const part2 = await multipartUpload(pathname, 'data2', {
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
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'create',
          },
          method: 'POST',
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          body: 'data1',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '1',
          },
          method: 'POST',
          duplex: 'half',
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          body: 'data2',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '2',
          },
          method: 'POST',
          duplex: 'half',
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          body: JSON.stringify([
            { etag: 'etag1', partNumber: 1 },
            { etag: 'etag2', partNumber: 2 },
          ]),
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'complete',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
          },
          method: 'POST',
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

      const multiPartUpload = await createMultipartUploader(pathname, {
        access: 'public',
        token,
      });
      expect(multiPartUpload.uploadId).toEqual('uploadId');
      expect(multiPartUpload.key).toEqual('key');

      const part1 = await multiPartUpload.uploadPart(1, 'data1');
      expect(part1).toEqual({
        etag: 'etag1',
        partNumber: 1,
      });

      const part2 = await multiPartUpload.uploadPart(2, 'data2');
      expect(part2).toEqual({
        etag: 'etag2',
        partNumber: 2,
      });

      const blob = await multiPartUpload.complete([part1, part2]);
      expect(blob).toEqual({
        contentDisposition: 'attachment; filename="foo.txt"',
        contentType: 'text/plain',
        pathname: 'foo.txt',
        url: 'https://storeId.public.blob.vercel-storage.com/foo.txt',
      });

      expect(fetchMock).toHaveBeenCalledTimes(4);

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'create',
          },
          method: 'POST',
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          body: 'data1',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '1',
          },
          method: 'POST',
          duplex: 'half',
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          body: 'data2',
          headers: {
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'upload',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
            'x-mpu-part-number': '2',
          },
          method: 'POST',
          duplex: 'half',
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        'https://blob.vercel-storage.com/mpu/foo.txt',
        {
          body: JSON.stringify([
            { etag: 'etag1', partNumber: 1 },
            { etag: 'etag2', partNumber: 2 },
          ]),
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer vercel_blob_client_fake_token_for_test',
            'x-api-version': '6',
            'x-mpu-action': 'complete',
            'x-mpu-key': 'key',
            'x-mpu-upload-id': 'uploadId',
          },
          method: 'POST',
        },
      );
    });
  });
});
