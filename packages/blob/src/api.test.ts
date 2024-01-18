import undici from 'undici';
import { BlobUnknownError, requestApi } from './api';
import { BlobError } from './helpers';

describe('api', () => {
  describe('request api', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
      jest.resetAllMocks();
      process.env = { ...OLD_ENV };
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

      await expect(
        requestApi('/api', { method: 'GET' }, undefined),
      ).rejects.toThrow(BlobError);

      expect(fetchMock).toHaveBeenCalledTimes(0);
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
        '/api',
        { method: 'POST', body: JSON.stringify({ foo: 'bar' }) },
        { token: '123' },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://blob.vercel-storage.com/api',
        {
          body: '{"foo":"bar"}',
          headers: {
            authorization: 'Bearer 123',
            'x-api-version': '6',
          },
          method: 'POST',
        },
      );

      expect(res).toEqual({ success: true });
    });

    it.each([
      [400, 'unknown_error'],
      [500, 'service_unavailable'],
    ])(
      `should retry '%s %s' error response`,
      async () => {
        const fetchSpy = jest
          .spyOn(undici, 'fetch')
          .mockImplementation(
            jest.fn().mockResolvedValue({ status: 500, ok: false }),
          );

        process.env.VERCEL_BLOB_RETRIES = '1';
        process.env.BLOB_READ_WRITE_TOKEN = 'test-token';

        await expect(
          requestApi('/api', { method: 'GET' }, undefined),
        ).rejects.toThrow(BlobUnknownError);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
      },
      10000,
    );

    it.each([
      [300, 'store_suspended'],
      [400, 'forbidden'],
      [500, 'not_found'],
      [600, 'bad_request'],
      [700, 'store_not_found'],
      [800, 'not_allowed'],
    ])(
      `should not retry '%s %s' response error response`,
      async (status, code) => {
        const fetchMock = jest.spyOn(undici, 'fetch').mockImplementation(
          jest.fn().mockResolvedValue({
            status,
            ok: false,
            json: () => Promise.resolve({ error: { code } }),
          }),
        );

        await expect(
          requestApi('/api', { method: 'GET' }, { token: '123' }),
        ).rejects.toThrow(BlobError);

        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );
  });
});
