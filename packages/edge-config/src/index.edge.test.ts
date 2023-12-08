import fetchMock from 'jest-fetch-mock';
import { version as pkgVersion } from '../package.json';
import { cache } from './utils/fetch-with-http-cache';
import {
  get,
  has,
  digest,
  getAll,
  createClient,
  type EdgeConfigClient,
} from './index';

function resetFetchMock(): void {
  fetchMock.resetMocks();
  // This ensures fetch throws when called without any mock
  // By default fetchMock would return with an empty string instead, which
  // is not a great default
  fetchMock.mockImplementation(() => {
    throw new Error('received fetch call but ran out of mocks');
  });
}

const sdkVersion = typeof pkgVersion === 'string' ? pkgVersion : '';
const baseUrl = 'https://edge-config.vercel.com/ecfg-1';

describe('default Edge Config', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    cache.clear();
  });

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
        fetchMock.mockReject();

        await expect(get('foo')).rejects.toThrow(
          '@vercel/edge-config: Network error',
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

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(get('foo')).rejects.toThrow(
          '@vercel/edge-config: Unexpected error',
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
          `${baseUrl}/items?version=1&key=bar&key=foo`,
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
      it('should throw', async () => {
        fetchMock.mockResponse(
          JSON.stringify({
            error: {
              code: 'edge_config_not_found',
              message: 'Could not find the edge config: ecfg-1',
            },
          }),
          {
            status: 404,
            headers: { 'content-type': 'application/json' },
          },
        );

        await expect(getAll(['foo', 'bar'])).rejects.toThrow(
          '@vercel/edge-config: Edge Config not found',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${baseUrl}/items?version=1&key=bar&key=foo`,
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
        fetchMock.mockReject();

        await expect(getAll()).rejects.toThrow(
          '@vercel/edge-config: Network error',
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

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(getAll()).rejects.toThrow(
          '@vercel/edge-config: Unexpected error',
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
          '@vercel/edge-config: Unexpected error',
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
          '@vercel/edge-config: Unexpected error',
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
        fetchMock.mockReject();

        await expect(digest()).rejects.toThrow(
          '@vercel/edge-config: Network error',
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
  });
});

describe('stale-while-revalidate semantics (in development)', () => {
  const modifiedConnectionString =
    'https://edge-config.vercel.com/ecfg-2?token=token-2';
  let edgeConfig: EdgeConfigClient;

  beforeEach(() => {
    resetFetchMock();
    cache.clear();
    // ensure swr runs
    process.env.NODE_ENV = 'development';
    edgeConfig = createClient(modifiedConnectionString);
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  describe('get', () => {
    describe('when item exists', () => {
      it('should use the in-memory cache and apply stale-while-revalidate semantics', async () => {
        fetchMock.mockResponseOnce(
          JSON.stringify({ items: { key1: 'value1a' }, digest: 'a' }),
        );
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');

        let resolve;
        const promise = new Promise<Response>((r) => {
          resolve = r;
        });

        fetchMock.mockReturnValue(promise);

        // here we're still receiving value1a as expected, while we are revalidating
        // the latest values in the background
        //
        // note that we're ensuring the read is possible before the evaluation
        // in the background succeeds by calling `resolve` after below
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');
        // more calls should not end up in more fetchMock calls since there
        // is already an in-flight promise
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');

        // @ts-expect-error -- pretend this is a response
        resolve(
          Promise.resolve({
            ok: true,
            headers: new Headers(),
            json: () =>
              Promise.resolve({ items: { key1: 'value1b' }, digest: 'b' }),
          }),
        );

        fetchMock.mockResponseOnce(
          JSON.stringify({ items: { key1: 'value1c' }, digest: 'c' }),
        );
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1b');

        // we only expect three calls since the multiple calls above share
        // the same fetch promise
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });

      // TODO since we don't currently have process.nextTick in edge runtime, we
      // can't actually batch these requests.
      it('should apply stale-while-revalidate across multiple keys', async () => {
        fetchMock.mockResponse(
          JSON.stringify({
            items: { key1: 'value1a', key2: 'value2a' },
            digest: 'digest-a',
          }),
        );

        // kick off in parallel so they are handled by the same pendingPromise
        const promiseKey1 = edgeConfig.get('key1');
        const promiseKey2 = edgeConfig.get('key2');
        const promiseMany = edgeConfig.getMany(['key1', 'key2']);
        const promiseAll = edgeConfig.getAll();
        const promiseDigest = edgeConfig.digest();

        // then assert individually
        await expect(promiseKey1).resolves.toEqual('value1a');
        await expect(promiseKey2).resolves.toEqual('value2a');
        await expect(promiseMany).resolves.toEqual(['value1a', 'value2a']);
        await expect(promiseMany).resolves.toEqual(['value1a', 'value2a']);
        await expect(promiseAll).resolves.toEqual({
          key1: 'value1a',
          key2: 'value2a',
        });
        await expect(promiseDigest).resolves.toEqual('digest-a');
        expect(fetchMock).toHaveBeenCalledTimes(5); // should be 1 after nextTick works

        let resolve;
        const promise = new Promise<Response>((r) => {
          resolve = r;
        });

        fetchMock.mockReturnValue(promise);

        // here we're still receiving value1a as expected, while we are revalidating
        // the latest values in the background
        //
        // note that we're ensuring the read is possible before the evaluation
        // in the background succeeds by calling `resolve` after below
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');
        // more calls should not end up in more fetchMock calls since there
        // is already an in-flight promise
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1a');
        await expect(edgeConfig.get('key2')).resolves.toEqual('value2a');
        expect(fetchMock).toHaveBeenCalledTimes(6); // should be 2 after nextTick works

        // @ts-expect-error -- pretend this is a response
        resolve(
          Promise.resolve({
            ok: true,
            headers: new Headers(),
            json: () =>
              Promise.resolve({ items: { key1: 'value1b' }, digest: 'b' }),
          }),
        );

        fetchMock.mockResponseOnce(
          JSON.stringify({ items: { key1: 'value1c' }, digest: 'c' }),
        );
        await expect(edgeConfig.get('key1')).resolves.toEqual('value1b');

        // we only expect three calls since the multiple calls above share
        // the same fetch promise
        expect(fetchMock).toHaveBeenCalledTimes(7); // should be 3 after nextTick works
      });
    });
  });
});
