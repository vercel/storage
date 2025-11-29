import fetchMock from 'jest-fetch-mock';
import { version as pkgVersion } from '../package.json';
import { get, getAll, has } from './index';
import type { EmbeddedEdgeConfig } from './types';
import { cache } from './utils/fetch-with-cached-response';

jest.mock('@vercel/edge-config/dist/stores.json', () => {
  return {
    ecfg_1: {
      updatedAt: 100,
      data: {
        items: { foo: 'foo-build-embedded', bar: 'bar-build-embedded' },
        digest: 'a',
      },
    },
  };
});

const sdkVersion = typeof pkgVersion === 'string' ? pkgVersion : '';
const baseUrl = 'https://edge-config.vercel.com/ecfg_1';

beforeEach(() => {
  fetchMock.resetMocks();
  cache.clear();
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
      });
    });
  });

  describe('getAll(keys)', () => {
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
      });
    });

    describe('when called with keys', () => {
      it('should return the selected items', async () => {
        fetchMock.mockReject(new Error('mock failed error'));

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
      });
    });
  });

  describe('has(key)', () => {
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
      });
    });
  });
});
