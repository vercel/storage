// Tests the bundled Edge Config (data.json) behavior

import fetchMock from 'jest-fetch-mock';
import { version as pkgVersion } from '../package.json';
import { get, getAll, has } from './index';
import type { EmbeddedEdgeConfig } from './types';
import { delay } from './utils/delay';
import { cache } from './utils/fetch-with-cached-response';
import { TimeoutError } from './utils/timeout-error';

jest.mock(
  '@vercel/edge-config-storage/stores.json',
  () => {
    return {
      ecfg_1: {
        updatedAt: 100,
        data: {
          items: { foo: 'foo-build-embedded', bar: 'bar-build-embedded' },
          digest: 'a',
        },
      },
    };
  },
  { virtual: true },
);

const sdkVersion = typeof pkgVersion === 'string' ? pkgVersion : '';
const baseUrl = 'https://edge-config.vercel.com/ecfg_1';

beforeEach(() => {
  fetchMock.resetMocks();
  cache.clear();

  jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
});

// mock fs for test
jest.mock('@vercel/edge-config-fs', () => {
  const embeddedEdgeConfig: EmbeddedEdgeConfig = {
    digest: 'awe1',
    items: { foo: 'bar', someArray: [] },
  };

  return {
    readFile: jest.fn((): Promise<string> => {
      return Promise.resolve(JSON.stringify(embeddedEdgeConfig));
    }),
  };
});

describe('default Edge Config', () => {
  describe('test conditions', () => {
    it('should have an env var called EDGE_CONFIG', () => {
      expect(process.env.EDGE_CONFIG).toEqual(
        'https://edge-config.vercel.com/ecfg_1?token=token-1',
      );
    });
  });

  describe('get(key)', () => {
    describe('when fetch aborts', () => {
      it('should fall back to the build embedded config', async () => {
        fetchMock.mockAbort();
        await expect(get('foo')).resolves.toEqual('foo-build-embedded');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/item/foo?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          },
        );

        expect(console.warn).toHaveBeenCalledWith(
          '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
          expect.any(DOMException),
        );
      });
    });

    describe('when fetch rejects', () => {
      it('should fall back to the build embedded config', async () => {
        fetchMock.mockReject(new Error('mock fetch error'));
        await expect(get('foo')).resolves.toEqual('foo-build-embedded');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/item/foo?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          },
        );

        expect(console.warn).toHaveBeenCalledWith(
          '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
          expect.any(DOMException),
        );
      });
    });

    describe('when fetch times out', () => {
      it('should fall back to the build embedded config', async () => {
        const timeoutMs = 50;
        fetchMock.mockResponseOnce(() =>
          delay(timeoutMs * 4, JSON.stringify('fetched-value')),
        );
        await expect(get('foo', { timeoutMs })).resolves.toEqual(
          'foo-build-embedded',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/item/foo?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          },
        );

        expect(console.warn).toHaveBeenCalledWith(
          '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
          expect.any(TimeoutError),
        );
      });
    });
  });

  describe('getAll(keys)', () => {
    describe('when fetch aborts', () => {
      describe('when called without keys', () => {
        it('should return all items', async () => {
          fetchMock.mockAbort();

          await expect(getAll()).resolves.toEqual({
            foo: 'foo-build-embedded',
            bar: 'bar-build-embedded',
          });

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items?version=1`, {
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          });

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
      describe('when called with keys', () => {
        it('should return the selected items', async () => {
          fetchMock.mockAbort();

          await expect(getAll(['foo', 'bar'])).resolves.toEqual({
            foo: 'foo-build-embedded',
            bar: 'bar-build-embedded',
          });

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/items?version=1&key=foo&key=bar`,
            {
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
    });

    describe('when fetch rejects', () => {
      describe('when called without keys', () => {
        it('should return all items', async () => {
          fetchMock.mockReject(new Error('mock fetch error'));

          await expect(getAll()).resolves.toEqual({
            foo: 'foo-build-embedded',
            bar: 'bar-build-embedded',
          });

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items?version=1`, {
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          });

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
      describe('when called with keys', () => {
        it('should return the selected items', async () => {
          fetchMock.mockReject(new Error('mock fetch error'));

          await expect(getAll(['foo', 'bar'])).resolves.toEqual({
            foo: 'foo-build-embedded',
            bar: 'bar-build-embedded',
          });

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/items?version=1&key=foo&key=bar`,
            {
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
    });

    describe('when fetch times out', () => {
      const timeoutMs = 50;
      describe('when called without keys', () => {
        it('should return all items', async () => {
          fetchMock.mockResponseOnce(() =>
            delay(
              timeoutMs * 4,
              JSON.stringify({ foo: 'fetched-foo', bar: 'fetched-bar' }),
            ),
          );

          await expect(getAll(undefined, { timeoutMs })).resolves.toEqual({
            foo: 'foo-build-embedded',
            bar: 'bar-build-embedded',
          });

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items?version=1`, {
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          });

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
      describe('when called with keys', () => {
        it('should return the selected items', async () => {
          fetchMock.mockResponseOnce(() =>
            delay(
              timeoutMs * 4,
              JSON.stringify({ foo: 'fetched-foo', bar: 'fetched-bar' }),
            ),
          );

          await expect(getAll(['foo', 'bar'], { timeoutMs })).resolves.toEqual({
            foo: 'foo-build-embedded',
            bar: 'bar-build-embedded',
          });

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/items?version=1&key=foo&key=bar`,
            {
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
    });
  });

  describe('has(key)', () => {
    describe('when fetch aborts', () => {
      describe('when item exists', () => {
        it('should return true', async () => {
          fetchMock.mockAbort();

          await expect(has('foo')).resolves.toEqual(true);

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/item/foo?version=1`,
            {
              method: 'HEAD',
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });

      describe('when the item does not exist', () => {
        it('should return false', async () => {
          fetchMock.mockAbort();
          await expect(has('foo-does-not-exist')).resolves.toEqual(false);
          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/item/foo-does-not-exist?version=1`,
            {
              method: 'HEAD',
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
    });

    describe('when fetch rejects', () => {
      describe('when item exists', () => {
        it('should return true', async () => {
          fetchMock.mockReject(new Error('mock fetch error'));

          await expect(has('foo')).resolves.toEqual(true);

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/item/foo?version=1`,
            {
              method: 'HEAD',
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });

      describe('when the item does not exist', () => {
        it('should return false', async () => {
          fetchMock.mockReject(new Error('mock fetch error'));
          await expect(has('foo-does-not-exist')).resolves.toEqual(false);
          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/item/foo-does-not-exist?version=1`,
            {
              method: 'HEAD',
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
    });

    describe('when fetch times out', () => {
      const timeoutMs = 50;
      describe('when item exists', () => {
        it('should return true', async () => {
          fetchMock.mockResponseOnce(() =>
            delay(timeoutMs * 4, {
              status: 404,
              headers: { 'x-edge-config-digest': '1' },
            }),
          );

          await expect(has('foo', { timeoutMs })).resolves.toEqual(true);

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/item/foo?version=1`,
            {
              method: 'HEAD',
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });

      describe('when the item does not exist', () => {
        it('should return false', async () => {
          fetchMock.mockResponseOnce(() =>
            delay(
              timeoutMs * 4,
              JSON.stringify({ foo: 'fetched-foo', bar: 'fetched-bar' }),
            ),
          );
          await expect(
            has('foo-does-not-exist', { timeoutMs }),
          ).resolves.toEqual(false);
          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `${baseUrl}/item/foo-does-not-exist?version=1`,
            {
              method: 'HEAD',
              headers: new Headers({
                Authorization: 'Bearer token-1',
                'x-edge-config-vercel-env': 'test',
                'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
                'cache-control': 'stale-if-error=604800',
              }),
              cache: 'no-store',
            },
          );

          expect(console.warn).toHaveBeenCalledWith(
            '@vercel/edge-config: Falling back to bundled version of ecfg_1 due to the following error',
            expect.any(DOMException),
          );
        });
      });
    });
  });
});
