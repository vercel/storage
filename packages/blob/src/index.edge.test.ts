import {
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
} from './index';

describe('blob client', () => {
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
});