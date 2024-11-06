import { readFile } from '@vercel/edge-config-fs';
import fetchMock from 'jest-fetch-mock';
import { version as pkgVersion } from '../package.json';
import type { EmbeddedEdgeConfig } from './types';
import { cache } from './utils/fetch-with-cached-response';
import { get, has, digest, createClient, getAll } from './index';

const sdkVersion = typeof pkgVersion === 'string' ? pkgVersion : '';
const baseUrl = 'https://edge-config.vercel.com/ecfg-1';

// eslint-disable-next-line jest/require-top-level-describe -- [@vercel/style-guide@5 migration]
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
        'https://edge-config.vercel.com/ecfg-1?token=token-1',
      );
    });
  });

  it('should fetch an item from the Edge Config specified by process.env.EDGE_CONFIG', async () => {
    fetchMock.mockResponse(JSON.stringify('bar'));

    await expect(get('foo')).resolves.toEqual('bar');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo?version=1`, {
      headers: new Headers({
        Authorization: 'Bearer token-1',
        'x-edge-config-vercel-env': 'test',
        'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
        'cache-control': 'stale-if-error=604800',
      }),
      cache: 'no-store',
    });
  });

  describe('get(key)', () => {
    describe('when item exists', () => {
      it('should return the value', async () => {
        fetchMock.mockResponse(JSON.stringify('bar'));

        await expect(get('foo')).resolves.toEqual('bar');

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

    describe('when the item does not exist', () => {
      it('should return undefined', async () => {
        fetchMock.mockResponse(
          JSON.stringify({
            error: {
              code: 'edge_config_item_not_found',
              message: 'Could not find the edge config item: foo',
            },
          }),
          {
            status: 404,
            headers: {
              'content-type': 'application/json',
              'x-edge-config-digest': 'fake',
            },
          },
        );

        await expect(get('foo')).resolves.toEqual(undefined);

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

    describe('when the edge config does not exist', () => {
      it('should return undefined', async () => {
        fetchMock.mockResponse(
          JSON.stringify({
            error: {
              code: 'edge_config_not_found',
              message: 'Could not find the edge config: ecfg-1',
            },
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );

        await expect(get('foo')).rejects.toThrow(
          '@vercel/edge-config: Edge Config not found',
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
      });
    });

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject(new Error('Unexpected fetch error'));

        await expect(get('foo')).rejects.toThrow('Unexpected fetch error');

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

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(get('foo')).rejects.toThrow(
          '@vercel/edge-config: Unexpected error due to response with status code 500',
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
      });
    });
  });

  describe('getAll(keys)', () => {
    describe('when called without keys', () => {
      it('should return all items', async () => {
        fetchMock.mockResponse(JSON.stringify({ foo: 'foo1' }));

        await expect(getAll()).resolves.toEqual({ foo: 'foo1' });

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
        fetchMock.mockResponse(JSON.stringify({ foo: 'foo1', bar: 'bar1' }));

        await expect(getAll(['foo', 'bar'])).resolves.toEqual({
          foo: 'foo1',
          bar: 'bar1',
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

    describe('when called with an empty string key', () => {
      it('should return the selected items', async () => {
        await expect(getAll([''])).resolves.toEqual({});
        expect(fetchMock).toHaveBeenCalledTimes(0);
      });
    });

    describe('when called with an empty string key mix', () => {
      it('should return the selected items', async () => {
        fetchMock.mockResponse(JSON.stringify({ foo: 'foo1' }));
        await expect(getAll(['foo', ''])).resolves.toEqual({ foo: 'foo1' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the edge config does not exist', () => {
      it('should throw', async () => {
        fetchMock.mockResponse(
          JSON.stringify({
            error: {
              code: 'edge_config_not_found',
              message: 'Could not find the edge config: ecfg-1',
            },
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );

        await expect(getAll(['foo', 'bar'])).rejects.toThrow(
          '@vercel/edge-config: Edge Config not found',
        );

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

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject(new Error('Unexpected fetch error'));

        await expect(getAll()).rejects.toThrow('Unexpected fetch error');

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

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(getAll()).rejects.toThrow(
          '@vercel/edge-config: Unexpected error due to response with status code 500',
        );

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
  });

  describe('has(key)', () => {
    describe('when item exists', () => {
      it('should return true', async () => {
        fetchMock.mockResponse('');

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
        fetchMock.mockResponse(
          JSON.stringify({
            error: {
              code: 'edge_config_item_not_found',
              message: 'Could not find the edge config item: foo',
            },
          }),
          {
            status: 404,
            headers: {
              'content-type': 'application/json',
              'x-edge-config-digest': 'fake',
            },
          },
        );

        await expect(has('foo')).resolves.toEqual(false);

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

    describe('when the edge config does not exist', () => {
      it('should return false', async () => {
        fetchMock.mockResponse(
          JSON.stringify({
            error: {
              code: 'edge_config_not_found',
              message: 'Could not find the edge config: ecfg-1',
            },
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );

        await expect(has('foo')).rejects.toThrow(
          '@vercel/edge-config: Edge Config not found',
        );

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
  });

  describe('/', () => {
    describe('when the request succeeds', () => {
      it('should return the digest', async () => {
        fetchMock.mockResponse(JSON.stringify('awe1'));

        await expect(digest()).resolves.toEqual('awe1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest?version=1`, {
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

    describe('when the server returns an unexpected status code', () => {
      it('should throw an Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(digest()).rejects.toThrow(
          '@vercel/edge-config: Unexpected error due to response with status code 500',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest?version=1`, {
          headers: new Headers({
            Authorization: 'Bearer token-1',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
          }),
          cache: 'no-store',
        });
      });

      it('should throw an Unexpected error on 404', async () => {
        fetchMock.mockResponse('', { status: 404 });

        await expect(digest()).rejects.toThrow(
          '@vercel/edge-config: Unexpected error due to response with status code 404',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest?version=1`, {
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

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject(new Error('Unexpected fetch error'));

        await expect(digest()).rejects.toThrow('Unexpected fetch error');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest?version=1`, {
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
  });
});

// these test the happy path only, as the cases are tested through the
// "default Edge Config" tests above anyhow
describe('createClient', () => {
  describe('when running with lambda layer on serverless function', () => {
    beforeAll(() => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'some-value';
    });

    afterAll(() => {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    });

    beforeEach(() => {
      (readFile as jest.Mock).mockClear();
    });

    describe('get(key)', () => {
      describe('when item exists', () => {
        it('should return the value', async () => {
          const edgeConfig = createClient(process.env.EDGE_CONFIG);
          await expect(edgeConfig.get('foo')).resolves.toEqual('bar');
          expect(fetchMock).toHaveBeenCalledTimes(0);
          expect(readFile).toHaveBeenCalledTimes(1);
          expect(readFile).toHaveBeenCalledWith(
            '/opt/edge-config/ecfg-1.json',
            'utf-8',
          );
        });
      });

      describe('when the item does not exist', () => {
        it('should return undefined', async () => {
          const edgeConfig = createClient(process.env.EDGE_CONFIG);
          await expect(edgeConfig.get('baz')).resolves.toEqual(undefined);
          expect(fetchMock).toHaveBeenCalledTimes(0);
          expect(readFile).toHaveBeenCalledTimes(1);
          expect(readFile).toHaveBeenCalledWith(
            '/opt/edge-config/ecfg-1.json',
            'utf-8',
          );
        });
      });
    });

    describe('has(key)', () => {
      describe('when item exists', () => {
        it('should return true', async () => {
          const edgeConfig = createClient(process.env.EDGE_CONFIG);
          await expect(edgeConfig.has('foo')).resolves.toEqual(true);
          expect(fetchMock).toHaveBeenCalledTimes(0);
          expect(readFile).toHaveBeenCalledTimes(1);
          expect(readFile).toHaveBeenCalledWith(
            '/opt/edge-config/ecfg-1.json',
            'utf-8',
          );
        });
      });

      describe('when the item does not exist', () => {
        it('should return false', async () => {
          const edgeConfig = createClient(process.env.EDGE_CONFIG);
          await expect(edgeConfig.has('baz')).resolves.toEqual(false);
          expect(fetchMock).toHaveBeenCalledTimes(0);
          expect(readFile).toHaveBeenCalledTimes(1);
          expect(readFile).toHaveBeenCalledWith(
            '/opt/edge-config/ecfg-1.json',
            'utf-8',
          );
        });
      });
    });

    describe('digest()', () => {
      it('should return the digest', async () => {
        const edgeConfig = createClient(process.env.EDGE_CONFIG);
        await expect(edgeConfig.digest()).resolves.toEqual('awe1');
        expect(fetchMock).toHaveBeenCalledTimes(0);
        expect(readFile).toHaveBeenCalledTimes(1);
        expect(readFile).toHaveBeenCalledWith(
          '/opt/edge-config/ecfg-1.json',
          'utf-8',
        );
      });
    });
  });

  describe('fetch cache', () => {
    it('should respect the fetch cache option', async () => {
      fetchMock.mockResponse(JSON.stringify('bar2'));
      const edgeConfig = createClient(process.env.EDGE_CONFIG, {
        cache: 'force-cache',
      });
      await expect(edgeConfig.get('foo')).resolves.toEqual('bar2');

      // returns undefined as file does not exist
      expect(readFile).toHaveBeenCalledTimes(1);
      expect(readFile).toHaveBeenCalledWith(
        '/opt/edge-config/ecfg-1.json',
        'utf-8',
      );

      // ensure fetch was called with the right options
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://edge-config.vercel.com/ecfg-1/item/foo?version=1',
        {
          cache: 'force-cache',
          headers: new Headers({
            Authorization: 'Bearer token-1',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'x-edge-config-vercel-env': 'test',
          }),
        },
      );
    });
  });
});
