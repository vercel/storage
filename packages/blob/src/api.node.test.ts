import undici from 'undici';
import {
  BlobAccessError,
  BlobContentTypeNotAllowedError,
  BlobNotFoundError,
  BlobServiceNotAvailable,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  requestApi,
} from './api';
import { BlobError, createChunkTransformStream } from './helpers';

describe('api', () => {
  describe('request api', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
      jest.resetAllMocks();
      jest.restoreAllMocks();

      process.env = { ...OLD_ENV };
      delete process.env.BLOB_STORE_ID;
      delete process.env.VERCEL_OIDC_TOKEN;
    });

    it('should throw if no token is provided', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      );

      process.env.BLOB_READ_WRITE_TOKEN = undefined;
      process.env.BLOB_STORE_ID = undefined;
      process.env.VERCEL_OIDC_TOKEN = undefined;

      await expect(
        requestApi('/method', { method: 'GET' }, undefined),
      ).rejects.toThrow(BlobError);

      expect(fetchMock).toHaveBeenCalledTimes(0);
    });

    it('should throw if BLOB_STORE_ID is set without an OIDC token', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      );

      process.env.BLOB_READ_WRITE_TOKEN = undefined;
      process.env.BLOB_STORE_ID = 'my-store';
      process.env.VERCEL_OIDC_TOKEN = undefined;

      await expect(
        requestApi('/method', { method: 'GET' }, undefined),
      ).rejects.toThrow(BlobError);

      expect(fetchMock).toHaveBeenCalledTimes(0);
    });

    it('should use BLOB_STORE_ID and VERCEL_OIDC_TOKEN when set', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      );

      process.env.BLOB_READ_WRITE_TOKEN = undefined;
      process.env.BLOB_STORE_ID = 'oidcStore';
      process.env.VERCEL_OIDC_TOKEN = 'oidc-jwt';

      const res = await requestApi<{ success: boolean }>(
        '/method',
        { method: 'POST', body: JSON.stringify({ foo: 'bar' }) },
        undefined,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(call[1].headers.authorization).toBe('Bearer oidc-jwt');
      expect(call[1].headers['x-api-blob-request-id']).toMatch(
        /^oidcStore:\d+:[a-f0-9]+$/,
      );
      expect(res).toEqual({ success: true });
    });

    it('should prefer OIDC when store id and VERCEL_OIDC_TOKEN are set, even if BLOB_READ_WRITE_TOKEN is set', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      );

      process.env.BLOB_READ_WRITE_TOKEN =
        'vercel_blob_rw_fromRwToken_30FakeRandomCharacters12345678';
      process.env.BLOB_STORE_ID = 'oidcStore';
      process.env.VERCEL_OIDC_TOKEN = 'oidc-jwt';

      await requestApi<{ success: boolean }>(
        '/method',
        { method: 'POST', body: JSON.stringify({}) },
        undefined,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(call[1].headers.authorization).toBe('Bearer oidc-jwt');
      expect(call[1].headers['x-api-blob-request-id']).toMatch(
        /^oidcStore:\d+:[a-f0-9]+$/,
      );
    });

    it('should use storeId option over BLOB_STORE_ID for OIDC', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      );

      process.env.BLOB_READ_WRITE_TOKEN = undefined;
      process.env.BLOB_STORE_ID = 'fromEnv';
      process.env.VERCEL_OIDC_TOKEN = 'oidc-jwt';

      await requestApi<{ success: boolean }>(
        '/method',
        { method: 'POST', body: JSON.stringify({}) },
        { storeId: 'fromOption' },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(call[1].headers.authorization).toBe('Bearer oidc-jwt');
      expect(call[1].headers['x-api-blob-request-id']).toMatch(
        /^fromOption:\d+:[a-f0-9]+$/,
      );
    });

    it('should fall back to BLOB_READ_WRITE_TOKEN when OIDC is set but store id is missing', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      );

      process.env.BLOB_READ_WRITE_TOKEN =
        'vercel_blob_rw_fallbackStore_30FakeRandomCharacters12345678';
      delete process.env.BLOB_STORE_ID;
      process.env.VERCEL_OIDC_TOKEN = 'orphan-oidc';

      await requestApi<{ success: boolean }>(
        '/method',
        { method: 'POST', body: JSON.stringify({}) },
        undefined,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(call[1].headers.authorization).toBe(
        'Bearer vercel_blob_rw_fallbackStore_30FakeRandomCharacters12345678',
      );
      expect(call[1].headers['x-api-blob-request-id']).toMatch(
        /^fallbackStore:\d+:[a-f0-9]+$/,
      );
    });

    it('should not retry successful request', async () => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      );

      const res = await requestApi<{ success: boolean }>(
        '/method',
        { method: 'POST', body: JSON.stringify({ foo: 'bar' }) },
        { token: '123' },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://vercel.com/api/blob/method',
        {
          body: '{"foo":"bar"}',
          duplex: undefined,
          headers: {
            authorization: 'Bearer 123',
            'x-api-blob-request-attempt': '0',
            'x-api-blob-request-id': expect.any(String) as string,
            'x-vercel-blob-store-id': '',
            'x-api-version': '12',
          },
          method: 'POST',
        },
      );

      expect(res).toEqual({ success: true });
    });

    it.each([
      [400, 'unknown_error', BlobUnknownError],
      [500, 'service_unavailable', BlobServiceNotAvailable],
    ])(
      `should retry '%s %s' error response`,
      async (status, code, error) => {
        const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
          jest.fn().mockResolvedValue({
            status,
            ok: false,
            json: () => Promise.resolve({ error: { code } }),
          }),
        );

        process.env.VERCEL_BLOB_RETRIES = '1';
        process.env.BLOB_READ_WRITE_TOKEN = 'test-token';

        await expect(
          requestApi('/api', { method: 'GET' }, undefined),
        ).rejects.toThrow(error);

        expect(fetchMock).toHaveBeenCalledTimes(2);
      },
      10000,
    );

    it.each([
      [300, 'store_suspended', BlobStoreSuspendedError],
      [400, 'forbidden', BlobAccessError],
      [
        400,
        'forbidden',
        BlobContentTypeNotAllowedError,
        '"contentType" text/plain is not allowed',
      ],
      [500, 'not_found', BlobNotFoundError],
      [600, 'bad_request', BlobError],
      [700, 'store_not_found', BlobStoreNotFoundError],
      [800, 'not_allowed', BlobUnknownError],
      [800, 'not_allowed', BlobUnknownError],
    ])(`should not retry '%s %s' response error response`, async (status, code, error, message = '') => {
      const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          status,
          ok: false,
          json: () => Promise.resolve({ error: { code, message } }),
        }),
      );

      await expect(
        requestApi('/api', { method: 'GET' }, { token: '123' }),
      ).rejects.toThrow(error);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createChunkTransformStream', () => {
  async function collectChunks(
    stream: ReadableStream<Uint8Array>,
  ): Promise<Uint8Array[]> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return chunks;
  }

  it('accumulates small chunks and emits full-sized chunks', async () => {
    const chunkSize = 4;
    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]).buffer);
        controller.enqueue(new Uint8Array([3, 4, 5, 6]).buffer);
        controller.enqueue(new Uint8Array([7]).buffer);
        controller.close();
      },
    });

    const chunks = await collectChunks(
      stream.pipeThrough(createChunkTransformStream(chunkSize)),
    );

    expect(chunks).toHaveLength(2);
    expect(Array.from(chunks[0]!)).toEqual([1, 2, 3, 4]);
    expect(Array.from(chunks[1]!)).toEqual([5, 6, 7]);
  });

  it('calls onProgress for each emitted chunk', async () => {
    const chunkSize = 3;
    const progress: number[] = [];
    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]).buffer);
        controller.close();
      },
    });

    await collectChunks(
      stream.pipeThrough(
        createChunkTransformStream(chunkSize, (bytes) => progress.push(bytes)),
      ),
    );

    expect(progress).toEqual([3, 2]);
  });

  it('flushes remaining bytes when stream ends', async () => {
    const chunkSize = 10;
    const stream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]).buffer);
        controller.close();
      },
    });

    const chunks = await collectChunks(
      stream.pipeThrough(createChunkTransformStream(chunkSize)),
    );

    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0]!)).toEqual([1, 2, 3]);
  });
});
