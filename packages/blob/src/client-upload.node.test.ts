import type { IncomingMessage } from 'node:http';
import {
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
  verifyCallbackSignature,
  handleUpload,
} from './client-upload';
import type { HeadBlobResult } from '.';

describe('client uploads', () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'TEST_TOKEN';
    jest.resetAllMocks();
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

  describe('handleUpload', () => {
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
      const jsonResponse = await handleUpload({
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
        await handleUpload({
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
