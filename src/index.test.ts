import fetchMock from 'jest-fetch-mock';
import {
  get,
  has,
  digest,
  createEdgeConfigClient,
  type EdgeConfigClient,
  getAll,
} from './index';
import type { EmbeddedEdgeConfig } from './types';

declare global {
  const EdgeRuntime: string | undefined;
}

beforeEach(() => {
  fetchMock.resetMocks();
});

const connectionString = process.env.EDGE_CONFIG as string;
const baseUrl = 'https://edge-config.vercel.com/v1/config/ecfg-1';

describe('default Edge Config', () => {
  describe('test conditions', () => {
    it('should have an env var called EDGE_CONFIG', () => {
      expect(connectionString).toEqual(
        'edge-config://token-1@edge-config.vercel.com/ecfg-1',
      );
    });
  });

  it('should fetch an item from the Edge Config specified by process.env.EDGE_CONFIG', async () => {
    fetchMock.mockResponse(JSON.stringify('bar'));

    await expect(get('foo')).resolves.toEqual('bar');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
      headers: { Authorization: 'Bearer token-1' },
    });
  });

  describe('get(key)', () => {
    describe('when item exists', () => {
      it('should return the value', async () => {
        fetchMock.mockResponse(JSON.stringify('bar'));

        await expect(get('foo')).resolves.toEqual('bar');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when the item does not exist', () => {
      it('should return undefined', async () => {
        fetchMock.mockResponse('', {
          status: 404,
          headers: { 'x-edge-config-digest': 'fake' },
        });

        await expect(get('foo')).resolves.toEqual(undefined);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when the edge config does not exist', () => {
      it('should return undefined', async () => {
        fetchMock.mockResponse('', { status: 404 });

        await expect(get('foo')).rejects.toThrowError(
          '@vercel/edge-config: Edge Config does not exist',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject();

        await expect(get('foo')).rejects.toThrowError(
          '@vercel/edge-config: Network error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(get('foo')).rejects.toThrowError(
          '@vercel/edge-config: Unexpected error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });
  });

  describe('getAll(keys)', () => {
    describe('when called without keys', () => {
      it('should return all items', async () => {
        fetchMock.mockResponse(JSON.stringify({ foo: 'foo1' }));

        await expect(getAll()).resolves.toEqual({ foo: 'foo1' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items`, {
          headers: { Authorization: 'Bearer token-1' },
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
          `${baseUrl}/items?key=foo&key=bar`,
          { headers: { Authorization: 'Bearer token-1' } },
        );
      });
    });

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject();

        await expect(getAll()).rejects.toThrowError(
          '@vercel/edge-config: Network error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when an unexpected status code is returned', () => {
      it('should throw a Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(getAll()).rejects.toThrowError(
          '@vercel/edge-config: Unexpected error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/items`, {
          headers: { Authorization: 'Bearer token-1' },
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
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          method: 'HEAD',
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when the item does not exist', () => {
      it('should return false', async () => {
        fetchMock.mockResponse('', {
          status: 404,
          headers: { 'x-edge-config-digest': 'fake' },
        });

        await expect(has('foo')).resolves.toEqual(false);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          method: 'HEAD',
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when the edge config does not exist', () => {
      it('should return false', async () => {
        fetchMock.mockResponse('', { status: 404 });

        await expect(has('foo')).rejects.toThrowError(
          '@vercel/edge-config: Edge Config does not exist',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
          method: 'HEAD',
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });
  });

  describe('digest()', () => {
    describe('when the request succeeds', () => {
      it('should return the digest', async () => {
        fetchMock.mockResponse(JSON.stringify({ digest: 'awe1' }));

        await expect(digest()).resolves.toEqual('awe1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when the server returns an unexpected status code', () => {
      it('should throw an Unexpected error on 500', async () => {
        fetchMock.mockResponse('', { status: 500 });

        await expect(digest()).rejects.toThrowError(
          '@vercel/edge-config: Unexpected error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });

      it('should throw an Unexpected error on 404', async () => {
        fetchMock.mockResponse('', { status: 404 });

        await expect(digest()).rejects.toThrowError(
          '@vercel/edge-config: Unexpected error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });

    describe('when the network fails', () => {
      it('should throw a Network error', async () => {
        fetchMock.mockReject();

        await expect(digest()).rejects.toThrowError(
          '@vercel/edge-config: Network error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });
    });
  });
});

// these test the happy path only, as the cases are tested through the
// "default Edge Config" tests above anyhow
describe('createEdgeConfig', () => {
  describe('when running without lambda layer or via edge function', () => {
    const modifiedConnectionString =
      'edge-config://token-2@edge-config.vercel.com/ecfg-2';
    const modifiedBaseUrl = 'https://edge-config.vercel.com/v1/config/ecfg-2';
    let edgeConfig: EdgeConfigClient;

    beforeEach(() => {
      edgeConfig = createEdgeConfigClient(modifiedConnectionString);
    });

    it('should be a function', () => {
      expect(typeof createEdgeConfigClient).toBe('function');
    });

    describe('when called without a baseUrl', () => {
      it('should throw', () => {
        expect(() => createEdgeConfigClient(undefined)).toThrowError(
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
            `${modifiedBaseUrl}/item/foo`,
            {
              headers: { Authorization: 'Bearer token-2' },
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
            `${modifiedBaseUrl}/item/foo`,
            {
              method: 'HEAD',
              headers: { Authorization: 'Bearer token-2' },
            },
          );
        });
      });
    });

    describe('digest()', () => {
      describe('when the request succeeds', () => {
        it('should return the digest', async () => {
          fetchMock.mockResponse(JSON.stringify({ digest: 'awe1' }));

          await expect(edgeConfig.digest()).resolves.toEqual('awe1');

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(fetchMock).toHaveBeenCalledWith(`${modifiedBaseUrl}/digest`, {
            headers: { Authorization: 'Bearer token-2' },
          });
        });
      });
    });
  });

  if (typeof EdgeRuntime !== 'string') {
    describe('when running with lambda layer on serverless function', () => {
      beforeAll(() => {
        process.env.AWS_LAMBDA_FUNCTION_NAME = 'some-value';
        //@ts-expect-error This function exists when called from a webpack bundle
        global.__webpack_require__ = () => void 0;
        //@ts-expect-error This function exists when called from a webpack bundle
        global.__non_webpack_require__ = jest.fn();
      });
      afterAll(() => {
        delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      });

      const embeddedEdgeConfig: EmbeddedEdgeConfig = {
        digest: 'awe1',
        items: {
          foo: 'bar',
          someArray: [],
        },
      };

      beforeEach(() => {
        //@ts-expect-error This function exists when called from a webpack bundle
        (global.__non_webpack_require__ as jest.Mock).mockReturnValueOnce(
          embeddedEdgeConfig,
        );
      });

      describe('get(key)', () => {
        describe('when item exists', () => {
          it('should return the value', async () => {
            const edgeConfig = createEdgeConfigClient(connectionString);
            await expect(edgeConfig.get('foo')).resolves.toEqual('bar');
            expect(fetchMock).toHaveBeenCalledTimes(0);
          });

          it('should not be able to modify the value for the next get', async () => {
            const edgeConfig = createEdgeConfigClient(connectionString);
            const someArray = await edgeConfig.get<string[]>('someArray');
            expect(someArray).toEqual([]);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            someArray!.push('intruder');
            // the pushed value on the old return value may not make it onto the
            // next get
            await expect(edgeConfig.get('someArray')).resolves.toEqual([]);
            expect(fetchMock).toHaveBeenCalledTimes(0);
          });
        });

        describe('when the item does not exist', () => {
          it('should return undefined', async () => {
            const edgeConfig = createEdgeConfigClient(connectionString);
            await expect(edgeConfig.get('baz')).resolves.toEqual(undefined);
            expect(fetchMock).toHaveBeenCalledTimes(0);
          });
        });
      });

      describe('has(key)', () => {
        describe('when item exists', () => {
          it('should return true', async () => {
            const edgeConfig = createEdgeConfigClient(connectionString);
            await expect(edgeConfig.has('foo')).resolves.toEqual(true);
            expect(fetchMock).toHaveBeenCalledTimes(0);
          });
        });

        describe('when the item does not exist', () => {
          it('should return false', async () => {
            const edgeConfig = createEdgeConfigClient(connectionString);
            await expect(edgeConfig.has('baz')).resolves.toEqual(false);
            expect(fetchMock).toHaveBeenCalledTimes(0);
          });
        });
      });

      describe('digest()', () => {
        it('should return the digest', async () => {
          const edgeConfig = createEdgeConfigClient(connectionString);
          await expect(edgeConfig.digest()).resolves.toEqual('awe1');
          expect(fetchMock).toHaveBeenCalledTimes(0);
        });
      });
    });
  }
});
