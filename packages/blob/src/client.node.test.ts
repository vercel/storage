import type { IncomingMessage } from 'node:http';
import {
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
  handleUpload,
} from './client';
import type { PutBlobResult } from '.';

describe('client uploads', () => {
  describe('generateClientTokenFromReadWriteToken', () => {
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));
    });

    it('generates a client token', async () => {
      const uploadToken = await generateClientTokenFromReadWriteToken({
        pathname: 'foo.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
        },
        token: 'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678',
      });

      expect(uploadToken).toMatchInlineSnapshot(
        `"vercel_blob_client_12345fakeStoreId_ZTVmZTJmYWZkOWJhMGNiNTVjOGExOWJkM2VhY2M5NzRhNzM4MmQ2NmEyN2EyMmYwMzFkMjQ0ZDIyMjMzN2Y0Yy5leUp3WVhSb2JtRnRaU0k2SW1admJ5NTBlSFFpTENKdmJsVndiRzloWkVOdmJYQnNaWFJsWkNJNmV5SmpZV3hzWW1GamExVnliQ0k2SW1oMGRIQnpPaTh2WlhoaGJYQnNaUzVqYjIwaWZTd2lkbUZzYVdSVmJuUnBiQ0k2TVRZM01qVXpNVEl6TURBd01IMD0="`,
      );

      expect(getPayloadFromClientToken(uploadToken)).toEqual({
        pathname: 'foo.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
        },
        validUntil: 1672531230000,
      });
    });

    it('accepts a tokenPayload property', async () => {
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

      expect(getPayloadFromClientToken(uploadToken)).toEqual({
        pathname: 'foo.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
          tokenPayload: '{"foo":"bar"}',
        },
        validUntil: 1672531230000,
      });
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
    it('should return client token when called with blob.generate-client-token', async () => {
      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
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
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async (pathname) => {
          await Promise.resolve();
          return Promise.resolve({
            tokenPayload: pathname,
            callbackUrl: 'https://example.com',
          });
        },
        onUploadCompleted: async (body) => {
          await Promise.resolve();
          spy.call(body);
        },
      });
      expect(jsonResponse).toMatchInlineSnapshot(`
        {
          "clientToken": "vercel_blob_client_12345fakeStoreId_Y2JhNTlmNWM3MmZmMGZmM2I2YzVlYzgwNTU3MDgwMWE1YTA4ZGU2MjIyNTFkNjRiYTI1NjVjNmRjYmFkYmQ5Yy5leUowYjJ0bGJsQmhlV3h2WVdRaU9pSnVaWGRtYVd4bExuUjRkQ0lzSW5CaGRHaHVZVzFsSWpvaWJtVjNabWxzWlM1MGVIUWlMQ0p2YmxWd2JHOWhaRU52YlhCc1pYUmxaQ0k2ZXlKallXeHNZbUZqYTFWeWJDSTZJbWgwZEhCek9pOHZaWGhoYlhCc1pTNWpiMjBpTENKMGIydGxibEJoZVd4dllXUWlPaUp1WlhkbWFXeGxMblI0ZENKOUxDSjJZV3hwWkZWdWRHbHNJam94TmpjeU5UTTBPREF3TURBd2ZRPT0=",
          "type": "blob.generate-client-token",
        }
      `);
      expect(spy).not.toHaveBeenCalled();
      expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- Either the test is incomplete, or we're messing up with TS
        getPayloadFromClientToken((jsonResponse as any).clientToken),
      ).toEqual({
        tokenPayload: 'newfile.txt',
        onUploadCompleted: {
          callbackUrl: 'https://example.com',
          tokenPayload: 'newfile.txt',
        },
        pathname: 'newfile.txt',
        validUntil: 1672534800000,
      });
    });

    it('should run onCompleted when called with blob.upload-completed', async () => {
      const token = 'vercel_blob_client_123456789_TEST_TOKEN';
      const spy = jest.fn();

      expect(
        await handleUpload({
          token,
          request: {
            headers: {
              // The next signature was generated via signPayload, export it when necessary
              'x-vercel-signature':
                'a4eac582498d4548d701eb8ff3e754f33f078e75298b9a1a0cdbac128981b28d',
            },
          } as unknown as IncomingMessage,
          body: {
            type: 'blob.upload-completed',
            payload: {
              blob: { pathname: 'newfile.txt' } as PutBlobResult,
              tokenPayload: 'custom-metadata',
            },
          },
          // Next option is only here for type completeness, not used in the test itself
          onBeforeGenerateToken: async (pathname) => {
            await Promise.resolve();
            return {
              tokenPayload: pathname,
              callbackUrl: 'https://example.com/upload-completed',
            };
          },
          onUploadCompleted: spy,
        }),
      ).toEqual({
        response: 'ok',
        type: 'blob.upload-completed',
      });
      expect(spy).toHaveBeenCalledWith({
        blob: { pathname: 'newfile.txt' } as PutBlobResult,
        tokenPayload: 'custom-metadata',
      });
    });

    it('uses clientPayload for tokenPayload by default', async () => {
      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
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
            clientPayload: 'custom-metadata-from-client',
            multipart: false,
          },
        },
        onBeforeGenerateToken: async () => {
          await Promise.resolve();
          return Promise.resolve({
            addRandomSuffix: false,
            callbackUrl: 'https://example.com',
          });
        },
        onUploadCompleted: async (body) => {
          await Promise.resolve();
          spy.call(body);
        },
      });
      expect(jsonResponse).toMatchInlineSnapshot(`
        {
          "clientToken": "vercel_blob_client_12345fakeStoreId_NThhZGE3YTVkODBjNTcxMmIyMzJlMTAzMDM3MTgwYzI5NzVlMjUzYjhkYzU4MzFkZTZjMzk4ZmEwNmY2ODI5Ny5leUpoWkdSU1lXNWtiMjFUZFdabWFYZ2lPbVpoYkhObExDSndZWFJvYm1GdFpTSTZJbTVsZDJacGJHVXVkSGgwSWl3aWIyNVZjR3h2WVdSRGIyMXdiR1YwWldRaU9uc2lZMkZzYkdKaFkydFZjbXdpT2lKb2RIUndjem92TDJWNFlXMXdiR1V1WTI5dElpd2lkRzlyWlc1UVlYbHNiMkZrSWpvaVkzVnpkRzl0TFcxbGRHRmtZWFJoTFdaeWIyMHRZMnhwWlc1MEluMHNJblpoYkdsa1ZXNTBhV3dpT2pFMk56STFNelE0TURBd01EQjk=",
          "type": "blob.generate-client-token",
        }
      `);
      expect(spy).not.toHaveBeenCalled();
      expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- Either the test is incomplete, or we're messing up with TS
        getPayloadFromClientToken((jsonResponse as any).clientToken),
      ).toMatchInlineSnapshot(`
        {
          "addRandomSuffix": false,
          "onUploadCompleted": {
            "callbackUrl": "https://example.com",
            "tokenPayload": "custom-metadata-from-client",
          },
          "pathname": "newfile.txt",
          "validUntil": 1672534800000,
        }
      `);
    });

    it('provides `clientPayload` in onBeforeGenerateToken', async () => {
      expect.assertions(1);

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
      await handleUpload({
        token,
        request: {
          headers: { 'x-vercel-signature': '123' },
        } as unknown as IncomingMessage,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            clientPayload: 'custom-metadata-from-client-we-expect',
            multipart: false,
          },
        },
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          expect(clientPayload).toEqual(
            'custom-metadata-from-client-we-expect',
          );
          await Promise.resolve();
          return Promise.resolve({
            addRandomSuffix: false,
            callbackUrl: 'https://example.com',
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });
    });

    it('ignores client callbackUrl when server provides one', async () => {
      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
      const serverCallbackUrl =
        'https://server-controlled.example.com/callback';
      const maliciousClientCallbackUrl = 'https://malicious.com/steal-data';

      // Client tries to set a malicious callback URL by including it in payload
      const payloadWithCallbackUrl = {
        type: 'blob.generate-client-token' as const,
        payload: {
          pathname: 'test.txt',
          clientPayload: null,
          multipart: false,
          // Client tries to inject a malicious callback URL - this should be ignored
          callbackUrl: maliciousClientCallbackUrl,
        }, // Cast to any to bypass TypeScript (simulating raw API call)
      };

      const jsonResponse = await handleUpload({
        token,
        request: {
          headers: { 'x-vercel-signature': '123' },
        } as unknown as IncomingMessage,
        body: payloadWithCallbackUrl,
        onBeforeGenerateToken: async () => {
          // Server controls the callback URL
          return Promise.resolve({
            callbackUrl: serverCallbackUrl,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      // Verify token was generated successfully
      expect(jsonResponse.type).toEqual('blob.generate-client-token');

      expect(
        jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken,
      ).toBeTruthy();

      // Decode the token to verify it uses the server-controlled callback URL
      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );
      expect(decodedPayload.onUploadCompleted?.callbackUrl).toEqual(
        serverCallbackUrl,
      );

      // Ensure the client's malicious URL is nowhere to be found
      expect(JSON.stringify(decodedPayload)).not.toContain(
        maliciousClientCallbackUrl,
      );
    });

    it("ignores client callbackUrl even if server doesn't provide one", async () => {
      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
      const maliciousClientCallbackUrl =
        'https://malicious-site.com/steal-data';

      // Simulate a curl request trying to inject callbackUrl into the payload
      const maliciousPayload = {
        type: 'blob.generate-client-token' as const,
        payload: {
          pathname: 'test.txt',
          clientPayload: null,
          multipart: false,
          // Even manually adding this should be completely ignored
          callbackUrl: maliciousClientCallbackUrl,
        },
      };

      const jsonResponse = await handleUpload({
        token,
        request: {
          headers: { 'x-vercel-signature': '123' },
        } as unknown as IncomingMessage,
        body: maliciousPayload,
        onBeforeGenerateToken: async () => {
          // Server doesn't provide any callback URL
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      // Verify token was generated successfully
      expect(jsonResponse.type).toEqual('blob.generate-client-token');

      expect(
        jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken,
      ).toBeTruthy();

      // Decode the token to verify NO callback URL is set (server didn't provide one)
      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );
      expect(decodedPayload.onUploadCompleted).toBeUndefined();

      // Ensure the malicious URL is nowhere to be found
      expect(JSON.stringify(decodedPayload)).not.toContain(
        maliciousClientCallbackUrl,
      );
    });

    it('should make onUploadCompleted optional', async () => {
      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          headers: { 'x-vercel-signature': '123' },
        } as unknown as IncomingMessage,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        // onUploadCompleted is not provided
      });

      expect(jsonResponse.type).toEqual('blob.generate-client-token');
    });

    it('should generate automatic callbackUrl when on Vercel and onUploadCompleted provided', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'branch-abc-123.vercel.app',
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          url: '/api/upload',
        } as unknown as Request,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      expect(jsonResponse.type).toEqual('blob.generate-client-token');

      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );

      expect(decodedPayload.onUploadCompleted?.callbackUrl).toBe(
        'https://branch-abc-123.vercel.app/api/upload',
      );

      process.env = originalEnv;
    });

    it('should use VERCEL_BLOB_CALLBACK_URL when provided', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL_BLOB_CALLBACK_URL: 'https://custom-callback.example.com',
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          url: '/api/upload',
        } as unknown as Request,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      expect(jsonResponse.type).toEqual('blob.generate-client-token');

      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );

      expect(decodedPayload.onUploadCompleted?.callbackUrl).toBe(
        'https://custom-callback.example.com/api/upload',
      );

      process.env = originalEnv;
    });

    it('should warn when callbackUrl provided but onUploadCompleted not defined', async () => {
      // eslint-disable-next-line no-console -- Testing console behavior
      const originalConsoleWarn = console.warn;
      const mockConsoleWarn = jest.fn();
      // eslint-disable-next-line no-console -- Testing console behavior
      console.warn = mockConsoleWarn;

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      await handleUpload({
        token,
        request: {
          headers: { 'x-vercel-signature': '123' },
        } as unknown as IncomingMessage,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
            callbackUrl: 'https://example.com/callback',
          });
        },
        // onUploadCompleted is not provided
      });

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'callbackUrl was provided but onUploadCompleted is not defined. The callback will not be handled.',
      );

      // eslint-disable-next-line no-console -- Testing console behavior
      console.warn = originalConsoleWarn;
    });

    it('should warn when onUploadCompleted provided but no callbackUrl can be determined', async () => {
      const originalEnv = process.env;
      // eslint-disable-next-line no-console -- Testing console behavior
      const originalConsoleWarn = console.warn;
      const mockConsoleWarn = jest.fn();
      // eslint-disable-next-line no-console -- Testing console behavior
      console.warn = mockConsoleWarn;

      // Remove all Vercel-related environment variables
      process.env = {
        NODE_ENV: 'test',
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      await handleUpload({
        token,
        request: {
          headers: { 'x-vercel-signature': '123' },
        } as unknown as IncomingMessage,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'onUploadCompleted provided but no callbackUrl could be determined. Please provide a callbackUrl in onBeforeGenerateToken or set the VERCEL_BLOB_CALLBACK_URL environment variable.',
      );

      process.env = originalEnv;
      // eslint-disable-next-line no-console -- Testing console behavior
      console.warn = originalConsoleWarn;
    });

    it('should handle blob.upload-completed without onUploadCompleted', async () => {
      const token = 'vercel_blob_client_123456789_TEST_TOKEN';

      expect(
        await handleUpload({
          token,
          request: {
            headers: {
              // The next signature was generated via signPayload, export it when necessary
              'x-vercel-signature':
                'a4eac582498d4548d701eb8ff3e754f33f078e75298b9a1a0cdbac128981b28d',
            },
          } as unknown as IncomingMessage,
          body: {
            type: 'blob.upload-completed',
            payload: {
              blob: { pathname: 'newfile.txt' } as PutBlobResult,
              tokenPayload: 'custom-metadata',
            },
          },
          onBeforeGenerateToken: async (pathname) => {
            await Promise.resolve();
            return {
              tokenPayload: pathname,
              callbackUrl: 'https://example.com/upload-completed',
            };
          },
          // onUploadCompleted is not provided
        }),
      ).toEqual({
        response: 'ok',
        type: 'blob.upload-completed',
      });
    });

    it('should generate correct callbackUrl with full URL in request', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'branch-abc-123.vercel.app',
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          url: 'http://localhost:3000/api/upload?test=1',
        } as unknown as Request,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      expect(jsonResponse.type).toEqual('blob.generate-client-token');

      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );

      expect(decodedPayload.onUploadCompleted?.callbackUrl).toBe(
        'https://branch-abc-123.vercel.app/api/upload?test=1',
      );

      process.env = originalEnv;
    });

    it('should generate correct callbackUrl with relative URL in request', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'myapp.vercel.app',
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          url: '/api/upload?example=test',
        } as unknown as Request,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      expect(jsonResponse.type).toEqual('blob.generate-client-token');

      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );

      expect(decodedPayload.onUploadCompleted?.callbackUrl).toBe(
        'https://myapp.vercel.app/api/upload?example=test',
      );

      process.env = originalEnv;
    });

    it('should use VERCEL_BLOB_CALLBACK_URL with query params preserved', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL_BLOB_CALLBACK_URL: 'https://webhook.example.com',
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          url: '/api/upload?userId=123&type=avatar',
        } as unknown as Request,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );

      expect(decodedPayload.onUploadCompleted?.callbackUrl).toBe(
        'https://webhook.example.com/api/upload?userId=123&type=avatar',
      );

      process.env = originalEnv;
    });

    it('should generate callbackUrl for production environment on Vercel', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'myapp.vercel.app',
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          url: '/api/blob/upload',
        } as unknown as Request,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );

      expect(decodedPayload.onUploadCompleted?.callbackUrl).toBe(
        'https://myapp.vercel.app/api/blob/upload',
      );

      process.env = originalEnv;
    });

    it('should fallback to VERCEL_URL when VERCEL_BRANCH_URL is missing in preview', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'myapp-git-feature-user.vercel.app',
        // VERCEL_BRANCH_URL is not set
      };

      const token =
        'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

      const jsonResponse = await handleUpload({
        token,
        request: {
          url: '/api/upload',
        } as unknown as Request,
        body: {
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'newfile.txt',
            multipart: false,
            clientPayload: null,
          },
        },
        onBeforeGenerateToken: async () => {
          return Promise.resolve({
            addRandomSuffix: false,
          });
        },
        onUploadCompleted: async () => {
          await Promise.resolve();
        },
      });

      const decodedPayload = getPayloadFromClientToken(
        (jsonResponse.type === 'blob.generate-client-token' &&
          jsonResponse.clientToken) ||
          '',
      );

      expect(decodedPayload.onUploadCompleted?.callbackUrl).toBe(
        'https://myapp-git-feature-user.vercel.app/api/upload',
      );

      process.env = originalEnv;
    });
  });
});
