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

  it('should return a valid connection for an `edgd-config:` connection string', () => {
    expect(
      pkg.parseConnectionString(
        'edge-config:id=ecfg_cljia81u2q1gappdgptj881dwwtc&token=00000000-0000-0000-0000-000000000000',
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

  it('should return null for an invalid `edge-config:` connection string', () => {
    expect(pkg.parseConnectionString('edge-config:token=abd&id=')).toEqual(
      null,
    );
    expect(
      pkg.parseConnectionString(
        'edge-config:ecfg_cljia81u2q1gappdgptj881dwwtc',
      ),
    ).toEqual(null);
    expect(
      pkg.parseConnectionString(
        'edge-config:id=ecfg_cljia81u2q1gappdgptj881dwwtc',
      ),
    ).toEqual(null);
    expect(pkg.parseConnectionString('edge-config:invalid')).toEqual(null);
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
    describe('attempting to read an empty key', () => {
      it('should return undefined', async () => {
        await expect(edgeConfig.get('')).resolves.toBe(undefined);
        expect(fetchMock).toHaveBeenCalledTimes(0);
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
    describe('attempting to read an empty key', () => {
      it('should return false', async () => {
        await expect(edgeConfig.has('')).resolves.toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(0);
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
    it('should reuse the response', async () => {
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

describe('in-memory cache with swr behaviour', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('use in-memory cache', async () => {
    fetchMock.mockResponse(JSON.stringify({ foo: 'bar' }));

    const edgeConfig = pkg.createClient(
      'https://edge-config.vercel.com/ecfg-2?token=token-2',
    );
    expect(await edgeConfig.get('foo')).toBe('bar');

    fetchMock.mockResponse(JSON.stringify({ foo: 'bar2' }));
    expect(await edgeConfig.get('foo')).toBe('bar'); // 1st call goes to the cache

    await new Promise<void>((res) => {
      setTimeout(res, 100);
    });
    expect(await edgeConfig.get('foo')).toBe('bar2'); // 2nd call is the updated one
  });
});
