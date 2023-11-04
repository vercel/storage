// This file is meant to ensure the common logic works in both enviornments.
//
// It runs tests in both envs:
// - @edge-runtime/jest-environment
// - node
import fetchMock from 'jest-fetch-mock';
import { version as pkgVersion } from '../package.json';
import type { EdgeConfigClient } from './types';
import { cache } from './utils/fetch-with-cached-response';
import * as pkg from './index';

const sdkVersion = typeof pkgVersion === 'string' ? pkgVersion : '';

describe('test conditions', () => {
  it('should have an env var called EDGE_CONFIG', () => {
    expect(process.env.EDGE_CONFIG).toEqual(
      'https://edge-config.vercel.com/ecfg-1?token=token-1',
    );
  });
});

// test both package.json exports (for node & edge) separately

describe('parseConnectionString', () => {
  it('should return null when an invalid Connection String is given', () => {
    expect(pkg.parseConnectionString('foo')).toBeNull();
  });

  it('should return null when the given Connection String has no token', () => {
    expect(
      pkg.parseConnectionString(
        'https://edge-config.vercel.com/ecfg_cljia81u2q1gappdgptj881dwwtc',
      ),
    ).toBeNull();
  });

  it('should return the id and token when a valid internal Connection String is given', () => {
    expect(
      pkg.parseConnectionString(
        'https://edge-config.vercel.com/ecfg_cljia81u2q1gappdgptj881dwwtc?token=00000000-0000-0000-0000-000000000000',
      ),
    ).toEqual({
      baseUrl:
        'https://edge-config.vercel.com/ecfg_cljia81u2q1gappdgptj881dwwtc',
      id: 'ecfg_cljia81u2q1gappdgptj881dwwtc',
      token: '00000000-0000-0000-0000-000000000000',
      type: 'vercel',
      version: '1',
    });
  });

  it('should return the id and token when a valid external Connection String is given using pathname', () => {
    expect(
      pkg.parseConnectionString(
        'https://example.com/ecfg_cljia81u2q1gappdgptj881dwwtc?token=00000000-0000-0000-0000-000000000000',
      ),
    ).toEqual({
      id: 'ecfg_cljia81u2q1gappdgptj881dwwtc',
      token: '00000000-0000-0000-0000-000000000000',
      version: '1',
      type: 'external',
      baseUrl: 'https://example.com/ecfg_cljia81u2q1gappdgptj881dwwtc',
    });
  });

  it('should return the id and token when a valid external Connection String is given using search params', () => {
    expect(
      pkg.parseConnectionString(
        'https://example.com/?id=ecfg_cljia81u2q1gappdgptj881dwwtc&token=00000000-0000-0000-0000-000000000000',
      ),
    ).toEqual({
      id: 'ecfg_cljia81u2q1gappdgptj881dwwtc',
      token: '00000000-0000-0000-0000-000000000000',
      baseUrl: 'https://example.com/',
      type: 'external',
      version: '1',
    });
  });
});

describe('when running without lambda layer or via edge function', () => {
  const modifiedConnectionString =
    'https://edge-config.vercel.com/ecfg-2?token=token-2';
  const modifiedBaseUrl = 'https://edge-config.vercel.com/ecfg-2';
  let edgeConfig: EdgeConfigClient;

  beforeEach(() => {
    fetchMock.resetMocks();
    cache.clear();
    edgeConfig = pkg.createClient(modifiedConnectionString);
  });

  it('should be a function', () => {
    expect(typeof pkg.createClient).toBe('function');
  });

  describe('when called without a baseUrl', () => {
    it('should throw', () => {
      expect(() => pkg.createClient(undefined)).toThrow(
        '@vercel/edge-config: No connection string provided',
      );
    });
  });

  describe('get', () => {
    describe('when item exists', () => {
      it('should fetch using information from the passed token', async () => {
        fetchMock.mockResponse(JSON.stringify('bar'));

        await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${modifiedBaseUrl}/item/foo?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-2',
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
        fetchMock.mockResponse('');

        await expect(edgeConfig.has('foo')).resolves.toEqual(true);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${modifiedBaseUrl}/item/foo?version=1`,
          {
            method: 'HEAD',
            headers: new Headers({
              Authorization: 'Bearer token-2',
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

  describe('digest()', () => {
    describe('when the request succeeds', () => {
      it('should return the digest', async () => {
        fetchMock.mockResponse(JSON.stringify('awe1'));

        await expect(edgeConfig.digest()).resolves.toEqual('awe1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${modifiedBaseUrl}/digest?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-2',
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

describe('etags and If-None-Match', () => {
  const modifiedConnectionString =
    'https://edge-config.vercel.com/ecfg-2?token=token-2';
  const modifiedBaseUrl = 'https://edge-config.vercel.com/ecfg-2';
  let edgeConfig: EdgeConfigClient;

  beforeEach(() => {
    fetchMock.resetMocks();
    cache.clear();
    edgeConfig = pkg.createClient(modifiedConnectionString);
  });

  describe('when reading the same item twice', () => {
    it('should reuse the response body', async () => {
      fetchMock.mockResponseOnce(JSON.stringify('bar'), {
        headers: { ETag: 'a' },
      });

      await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

      // the server would not actually send a response body the second time
      // as the etag matches
      fetchMock.mockResponseOnce('', {
        status: 304,
        headers: { ETag: 'a' },
      });

      // second call should reuse response

      await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/item/foo?version=1`,
        {
          headers: new Headers({
            Authorization: 'Bearer token-2',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
          }),
          cache: 'no-store',
        },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/item/foo?version=1`,
        {
          headers: new Headers({
            Authorization: 'Bearer token-2',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
            'If-None-Match': 'a',
          }),
          cache: 'no-store',
        },
      );
    });
  });
});

describe('stale-if-error semantics', () => {
  const modifiedConnectionString =
    'https://edge-config.vercel.com/ecfg-2?token=token-2';
  const modifiedBaseUrl = 'https://edge-config.vercel.com/ecfg-2';
  let edgeConfig: EdgeConfigClient;

  beforeEach(() => {
    fetchMock.resetMocks();
    cache.clear();
    edgeConfig = pkg.createClient(modifiedConnectionString);
  });

  describe('when reading the same item twice but the second read has an internal server error', () => {
    it('should reuse the cached/stale response', async () => {
      fetchMock.mockResponseOnce(JSON.stringify('bar'), {
        headers: { ETag: 'a' },
      });

      await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

      // pretend the server returned a 502 without any response body
      fetchMock.mockResponseOnce('', { status: 502 });

      // second call should reuse earlier response
      await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/item/foo?version=1`,
        {
          headers: new Headers({
            Authorization: 'Bearer token-2',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
          }),
          cache: 'no-store',
        },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/item/foo?version=1`,
        {
          headers: new Headers({
            Authorization: 'Bearer token-2',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
            'If-None-Match': 'a',
          }),
          cache: 'no-store',
        },
      );
    });
  });

  describe('when reading the same item twice but the second read throws a network error', () => {
    it('should reuse the cached/stale response', async () => {
      fetchMock.mockResponseOnce(JSON.stringify('bar'), {
        headers: { ETag: 'a' },
      });

      await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

      // pretend there was a network error which led to fetch throwing
      fetchMock.mockAbortOnce();

      // second call should reuse earlier response
      await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/item/foo?version=1`,
        {
          headers: new Headers({
            Authorization: 'Bearer token-2',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
          }),
          cache: 'no-store',
        },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/item/foo?version=1`,
        {
          headers: new Headers({
            Authorization: 'Bearer token-2',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
            'If-None-Match': 'a',
          }),
          cache: 'no-store',
        },
      );
    });
  });
});

describe('connectionStrings', () => {
  describe('when used with external connection strings', () => {
    const modifiedConnectionString = 'https://example.com/ecfg-2?token=token-2';

    let edgeConfig: EdgeConfigClient;

    beforeEach(() => {
      fetchMock.resetMocks();
      cache.clear();
      edgeConfig = pkg.createClient(modifiedConnectionString);
    });

    it('should be a function', () => {
      expect(typeof pkg.createClient).toBe('function');
    });

    describe('connection', () => {
      it('should contain the info parsed from the connection string', () => {
        expect(edgeConfig.connection).toEqual({
          baseUrl: 'https://example.com/ecfg-2',
          id: 'ecfg-2',
          token: 'token-2',
          type: 'external',
          version: '1',
        });
      });
    });

    describe('get', () => {
      describe('when item exists', () => {
        it('should fetch using information from the passed token', async () => {
          fetchMock.mockResponse(JSON.stringify('bar'));

          await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(
            `https://example.com/ecfg-2/item/foo?version=1`,
            {
              headers: new Headers({
                Authorization: 'Bearer token-2',
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
});

describe('dataloader', () => {
  function simulateNewRequestContext(): void {
    // referential equality of the returned store matters
    // same reference means same request
    const requestContext = {};
    // @ts-expect-error -- this is a vercel primitive
    globalThis[Symbol.for('@vercel/request-context')] = {
      get: () => requestContext,
    };
  }

  function resetRequestContext(): void {
    // @ts-expect-error -- this is a vercel primitive
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- ok
    delete globalThis[Symbol.for('@vercel/request-context')];
  }

  const modifiedConnectionString =
    'https://edge-config.vercel.com/ecfg-2?token=token-2';
  const modifiedBaseUrl = 'https://edge-config.vercel.com/ecfg-2';
  let edgeConfig: EdgeConfigClient;

  beforeEach(() => {
    fetchMock.resetMocks();
    cache.clear();
    edgeConfig = pkg.createClient(modifiedConnectionString);
    resetRequestContext();
  });

  it('caches reads per request', async () => {
    simulateNewRequestContext();
    fetchMock.mockResponse(JSON.stringify('bar'));

    await expect(edgeConfig.get('foo')).resolves.toEqual('bar');
    await expect(edgeConfig.get('foo')).resolves.toEqual('bar');
    fetchMock.mockResponse(JSON.stringify('baz'));

    // still bar as it's the same request
    await expect(edgeConfig.get('foo')).resolves.toEqual('bar');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${modifiedBaseUrl}/item/foo?version=1`,
      {
        headers: new Headers({
          Authorization: 'Bearer token-2',
          'x-edge-config-vercel-env': 'test',
          'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
          'cache-control': 'stale-if-error=604800',
        }),
        cache: 'no-store',
      },
    );

    simulateNewRequestContext();
    await expect(edgeConfig.get('foo')).resolves.toEqual('baz');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${modifiedBaseUrl}/item/foo?version=1`,
      {
        headers: new Headers({
          Authorization: 'Bearer token-2',
          'x-edge-config-vercel-env': 'test',
          'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
          'cache-control': 'stale-if-error=604800',
        }),
        cache: 'no-store',
      },
    );
  });

  it('returns objects with distinct references', async () => {
    simulateNewRequestContext();
    fetchMock.mockResponse(JSON.stringify({}));

    const aPromise = edgeConfig.get('foo');
    const bPromise = edgeConfig.get('foo');

    await expect(aPromise).resolves.toEqual({});
    await expect(bPromise).resolves.toEqual({});

    // ensure dataloader kicked in
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const a = await aPromise;
    const b = await bPromise;
    // ensure they do not have referential equality
    expect(a).not.toBe(b);
  });

  it('batches reads of distinct keys', async () => {
    simulateNewRequestContext();
    fetchMock.mockResponse(
      JSON.stringify({
        key1: 'value1',
        key2: 'value2',
      }),
    );

    // kick them off in the same tick so batching kicks in
    // note that users could just use edgeConfig.getAll(["key1", "key2"]) instead
    const a = edgeConfig.get('key1');
    const b = edgeConfig.get('key2');

    await expect(a).resolves.toEqual('value1');
    await expect(b).resolves.toEqual('value2');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${modifiedBaseUrl}/items?version=1&key=key1&key=key2`,
      {
        headers: new Headers({
          Authorization: 'Bearer token-2',
          'x-edge-config-vercel-env': 'test',
          'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
          'cache-control': 'stale-if-error=604800',
        }),
        cache: 'no-store',
      },
    );
  });

  it('uses the result of getAll() to prime get() and has()', async () => {
    simulateNewRequestContext();
    fetchMock.mockResponseOnce(
      JSON.stringify({
        key1: 'value1',
        key2: 'value2',
      }),
    );

    // prime the cache by calling getAll()
    await expect(edgeConfig.getAll()).resolves.toEqual({
      key1: 'value1',
      key2: 'value2',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${modifiedBaseUrl}/items?version=1`,
      {
        headers: new Headers({
          Authorization: 'Bearer token-2',
          'x-edge-config-vercel-env': 'test',
          'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
          'cache-control': 'stale-if-error=604800',
        }),
        cache: 'no-store',
      },
    );

    await expect(edgeConfig.get('key1')).resolves.toEqual('value1');
    await expect(edgeConfig.get('key2')).resolves.toEqual('value2');
    await expect(edgeConfig.has('key1')).resolves.toEqual(true);
    await expect(edgeConfig.has('key2')).resolves.toEqual(true);

    // only one call to fetchMock as all keys should have been primed
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the result of get() to prime has()', async () => {
    simulateNewRequestContext();
    const value = 'value1';
    fetchMock.mockResponseOnce(JSON.stringify(value));

    // prime the cache by calling get()
    await expect(edgeConfig.get('key1')).resolves.toEqual(value);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${modifiedBaseUrl}/item/key1?version=1`,
      {
        headers: new Headers({
          Authorization: 'Bearer token-2',
          'x-edge-config-vercel-env': 'test',
          'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
          'cache-control': 'stale-if-error=604800',
        }),
        cache: 'no-store',
      },
    );

    // this should not result in a new request as get() should have primed has()
    await expect(edgeConfig.has('key1')).resolves.toEqual(true);

    // only one call to fetchMock as all keys should have been primed
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('methods', () => {
    describe('get', () => {
      it('handles when the item exists', async () => {
        simulateNewRequestContext();
        // use a complex object so we can test referential equality
        const value: string[] = [];
        fetchMock.mockResponse(JSON.stringify(value));

        const aPromise = edgeConfig.get('key1');
        await expect(aPromise).resolves.toEqual(value);

        const bPromise = edgeConfig.get('key1');
        await expect(bPromise).resolves.toEqual(value);

        // returned result should not be referentially equal
        const [a, b] = await Promise.all([aPromise, bPromise]);
        expect(a).not.toBe(b);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${modifiedBaseUrl}/item/key1?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-2',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          },
        );
      });

      it('handles when the item does not exist', async () => {
        simulateNewRequestContext();
        fetchMock.mockResponse(
          JSON.stringify({
            error: {
              code: 'edge_config_item_not_found',
              message: 'Could not find the edge config item: x',
            },
          }),
          {
            status: 404,
            headers: { 'x-edge-config-digest': 'awe1' },
          },
        );

        await expect(edgeConfig.get('key1')).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledWith(
          `${modifiedBaseUrl}/item/key1?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-2',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          },
        );

        await expect(edgeConfig.get('key1')).resolves.toBeUndefined();
        await expect(edgeConfig.has('key1')).resolves.toBe(false);

        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('getAll', () => {
      it('handles when all items exist', async () => {
        simulateNewRequestContext();
        const items = {
          key1: 'value1',
          key2: 'value2',
        };
        fetchMock.mockResponse(JSON.stringify(items));

        const aPromise = edgeConfig.getAll();
        await expect(aPromise).resolves.toEqual(items);

        const bPromise = edgeConfig.getAll();
        await expect(bPromise).resolves.toEqual(items);

        // returned result should not be referentially equal
        const [a, b] = await Promise.all([aPromise, bPromise]);
        expect(a).not.toBe(b);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${modifiedBaseUrl}/items?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-2',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          },
        );
      });

      it('handles when some items exist', async () => {
        simulateNewRequestContext();
        const items = { key1: 'value1' };
        fetchMock.mockResponseOnce(JSON.stringify(items));

        // load for real
        await expect(edgeConfig.getAll()).resolves.toEqual(items);

        // reuse the results of getAll()
        await expect(edgeConfig.get('key1')).resolves.toEqual(items.key1);
        await expect(edgeConfig.has('key1')).resolves.toEqual(true);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          `${modifiedBaseUrl}/items?version=1`,
          {
            headers: new Headers({
              Authorization: 'Bearer token-2',
              'x-edge-config-vercel-env': 'test',
              'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
              'cache-control': 'stale-if-error=604800',
            }),
            cache: 'no-store',
          },
        );
      });
    });

    it('has', async () => {
      simulateNewRequestContext();
      fetchMock.mockResponse('');

      await expect(edgeConfig.has('key1')).resolves.toEqual(true);
      await expect(edgeConfig.has('key1')).resolves.toEqual(true);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/item/key1?version=1`,
        {
          method: 'HEAD',
          headers: new Headers({
            Authorization: 'Bearer token-2',
            'x-edge-config-vercel-env': 'test',
            'x-edge-config-sdk': `@vercel/edge-config@${sdkVersion}`,
            'cache-control': 'stale-if-error=604800',
          }),
          cache: 'no-store',
        },
      );
    });

    it('digest', async () => {
      simulateNewRequestContext();
      const digest = 'awe1';
      fetchMock.mockResponse(JSON.stringify(digest));

      await expect(edgeConfig.digest()).resolves.toEqual(digest);
      await expect(edgeConfig.digest()).resolves.toEqual(digest);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `${modifiedBaseUrl}/digest?version=1`,
        {
          headers: new Headers({
            Authorization: 'Bearer token-2',
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
