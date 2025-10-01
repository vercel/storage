import fetchMock from 'jest-fetch-mock';
import { version as pkgVersion } from '../package.json';
import { get, has, all, mget } from './index';

const sdkVersion = typeof pkgVersion === 'string' ? pkgVersion : '';
const baseUrl = 'https://edge-config.vercel.com/ecfg-1';

// eslint-disable-next-line jest/require-top-level-describe -- [@vercel/style-guide@5 migration]
beforeEach(() => {
  fetchMock.resetMocks();
  process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_STREAM = '1';
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
    fetchMock.mockResponse(JSON.stringify('bar'), {
      headers: {
        'x-edge-config-digest': 'fake',
        'x-edge-config-updated-at': '1000',
        'content-type': 'application/json',
      },
    });

    await expect(get('foo')).resolves.toEqual('bar');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo?version=1`, {
      method: 'GET',
      headers: new Headers({
        Authorization: 'Bearer token-1',
        'x-edge-config-vercel-env': 'test',
        'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
        // 'cache-control': 'stale-if-error=604800',
      }),
      cache: 'no-store',
    });
  });

  describe('get(key)', () => {
    describe('when item exists', () => {
      it('should return the value', async () => {
        fetchMock.mockResponse(JSON.stringify('bar'), {
          headers: {
            'x-edge-config-digest': 'fake',
            'x-edge-config-updated-at': '1000',
            'content-type': 'application/json',
          },
        });

        await expect(get('foo')).resolves.toEqual('bar');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/item/foo?version=1`,
          {
            method: 'GET',
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
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
              'x-edge-config-digest': 'digest1',
              'x-edge-config-updated-at': '1000',
              'content-type': 'application/json',
            },
          },
        );

        await expect(get('foo')).resolves.toEqual(undefined);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/item/foo?version=1`,
          {
            method: 'GET',
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
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
            method: 'GET',
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            }),
            cache: 'no-store',
          },
        );
      });
    });

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject(new Error('Unexpected fetch error'));

        await expect(get('foo256')).rejects.toThrow('Unexpected fetch error');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/item/foo256?version=1`,
          {
            method: 'GET',
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            }),
            cache: 'no-store',
          },
        );
      });
    });

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(get('foo500')).rejects.toThrow(
          '@vercel/edge-config: Unexpected error due to response with status code 500',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/item/foo500?version=1`,
          {
            method: 'GET',
            headers: new Headers({
              Authorization: 'Bearer token-1',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            }),
            cache: 'no-store',
          },
        );
      });
    });
  });

  describe('all()', () => {
    it('should return all items', async () => {
      fetchMock.mockResponse(JSON.stringify({ foo: 'foo1' }), {
        headers: {
          'x-edge-config-digest': 'fake',
          'x-edge-config-updated-at': '1000',
          'content-type': 'application/json',
        },
      });

      await expect(all()).resolves.toEqual({ foo: 'foo1' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items?version=1`, {
        headers: new Headers({
          Authorization: 'Bearer token-1',
          'x-edge-config-vercel-env': 'test',
          'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
        }),
        cache: 'no-store',
      });
    });
  });

  describe('mget(keys)', () => {
    describe('when called with keys', () => {
      it('should return the selected items', async () => {
        fetchMock.mockResponse(JSON.stringify({ foo: 'foo1', bar: 'bar1' }), {
          headers: {
            'x-edge-config-digest': 'fake',
            'x-edge-config-updated-at': '1000',
            'content-type': 'application/json',
          },
        });

        await expect(mget(['foo', 'bar'])).resolves.toEqual({
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
            }),
            cache: 'no-store',
          },
        );
      });
    });

    describe('when called with an empty string key', () => {
      it('should return the selected items', async () => {
        await expect(mget([''])).resolves.toEqual({});
        expect(fetchMock).toHaveBeenCalledTimes(0);
      });
    });

    describe('when called with an empty string key mix', () => {
      it('should return the selected items', async () => {
        fetchMock.mockResponse(JSON.stringify({ foo: 'foo1' }), {
          headers: {
            'x-edge-config-digest': 'fake',
            'x-edge-config-updated-at': '1000',
            'content-type': 'application/json',
          },
        });
        await expect(mget(['foo', ''])).resolves.toEqual({
          foo: 'foo1',
        });
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

        await expect(mget(['foo', 'bar'])).rejects.toThrow(
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
            }),
            cache: 'no-store',
          },
        );
      });
    });

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject(new Error('Unexpected fetch error'));

        await expect(all()).rejects.toThrow('Unexpected fetch error');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items?version=1`, {
          headers: new Headers({
            Authorization: 'Bearer token-1',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
          }),
          cache: 'no-store',
        });
      });
    });

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(all()).rejects.toThrow(
          '@vercel/edge-config: Unexpected error due to response with status code 500',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items?version=1`, {
          headers: new Headers({
            Authorization: 'Bearer token-1',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
          }),
          cache: 'no-store',
        });
      });
    });
  });

  describe('has(key)', () => {
    describe('when item exists', () => {
      it('should return true', async () => {
        fetchMock.mockResponse('', {
          headers: {
            'x-edge-config-digest': 'fake',
            'x-edge-config-updated-at': '1000',
            'content-type': 'application/json',
          },
        });

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
              'x-edge-config-updated-at': '1000',
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
            }),
            cache: 'no-store',
          },
        );
      });
    });
  });
});
