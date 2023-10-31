import {
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
} from './client';

describe('blob client', () => {
  beforeEach(() => {
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
          tokenPayload: JSON.stringify({ foo: 'bar' }),
        },
        token: 'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
      });
      expect(uploadToken).toMatchInlineSnapshot(
        `"vercel_blob_client_12345fakeStoreId_N2I2NTAxOGI1Y2IwZDhlY2VlZGUyYTQ2YjE1ZmJhODRlYjU3M2Q5MjBlNjNiYmI4NmQ0ZTRhOTJhZmM1NTVjMi5leUp3WVhSb2JtRnRaU0k2SW1admJ5NTBlSFFpTENKdmJsVndiRzloWkVOdmJYQnNaWFJsWkNJNmV5SmpZV3hzWW1GamExVnliQ0k2SW1oMGRIQnpPaTh2WlhoaGJYQnNaUzVqYjIwaUxDSjBiMnRsYmxCaGVXeHZZV1FpT2lKN1hDSm1iMjljSWpwY0ltSmhjbHdpZlNKOUxDSjJZV3hwWkZWdWRHbHNJam94TmpjeU5UTXhNak13TURBd2ZRPT0="`,
      );

      expect(getPayloadFromClientToken(uploadToken)).toMatchInlineSnapshot(`
        {
          "onUploadCompleted": {
            "callbackUrl": "https://example.com",
            "tokenPayload": "{"foo":"bar"}",
          },
          "pathname": "foo.txt",
          "validUntil": 1672531230000,
        }
      `);
    });
  });
});
