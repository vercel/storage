import fetchMock from 'jest-fetch-mock';
import {
  get,
  has,
  digest,
  createEdgeConfigClient,
  type EdgeConfig,
} from './index';

beforeEach(() => {
  fetchMock.resetMocks();
});

const connectionString = process.env.VERCEL_EDGE_CONFIG as string;
const baseUrl = 'https://edge-config.vercel.com/v1/config/ecfg-1';

describe('default Edge Config', () => {
  describe('test conditions', () => {
    it('should have an env var called VERCEL_EDGE_CONFIG', () => {
      expect(connectionString).toEqual(
        'edge-config://token-1@edge-config.vercel.com/ecfg-1',
      );
    });
  });

  it('should fetch an item from the Edge Config specified by process.env.VERCEL_EDGE_CONFIG', async () => {
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
        fetchMock.mockResponse('', { status: 404 });

        await expect(get('foo')).resolves.toEqual(undefined);

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
          '@vercel/edge-data: Network error',
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
          '@vercel/edge-data: Unexpected error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/item/foo`, {
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
        fetchMock.mockResponse('', { status: 404 });

        await expect(has('foo')).resolves.toEqual(false);

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
        fetchMock.mockResponse(JSON.stringify('awe1'));

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
          '@vercel/edge-data: Unexpected error',
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/digest`, {
          headers: { Authorization: 'Bearer token-1' },
        });
      });

      it('should throw an Unexpected error on 404', async () => {
        fetchMock.mockResponse('', { status: 404 });

        await expect(digest()).rejects.toThrowError(
          '@vercel/edge-data: Unexpected error',
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
          '@vercel/edge-data: Network error',
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
  const modifiedConnectionString =
    'edge-config://token-2@edge-config.vercel.com/ecfg-2';
  const modifiedBaseUrl = 'https://edge-config.vercel.com/v1/config/ecfg-2';
  let edgeConfig: EdgeConfig;

  beforeEach(() => {
    edgeConfig = createEdgeConfigClient(modifiedConnectionString);
  });

  it('should be a function', () => {
    expect(typeof createEdgeConfigClient).toBe('function');
  });

  describe('when called without a baseUrl', () => {
    it('should throw', () => {
      expect(() => createEdgeConfigClient(undefined)).toThrowError(
        '@vercel/edge-data: No connection string provided',
      );
    });
  });

  describe('get', () => {
    describe('when item exists', () => {
      it('should fetch using information from the passed token', async () => {
        fetchMock.mockResponse(JSON.stringify('bar'));

        await expect(edgeConfig.get('foo')).resolves.toEqual('bar');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${modifiedBaseUrl}/item/foo`, {
          headers: { Authorization: 'Bearer token-2' },
        });
      });
    });
  });

  describe('has(key)', () => {
    describe('when item exists', () => {
      it('should return true', async () => {
        fetchMock.mockResponse('');

        await expect(edgeConfig.has('foo')).resolves.toEqual(true);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${modifiedBaseUrl}/item/foo`, {
          method: 'HEAD',
          headers: { Authorization: 'Bearer token-2' },
        });
      });
    });
  });

  describe('digest()', () => {
    describe('when the request succeeds', () => {
      it('should return the digest', async () => {
        fetchMock.mockResponse(JSON.stringify('awe1'));

        await expect(edgeConfig.digest()).resolves.toEqual('awe1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${modifiedBaseUrl}/digest`, {
          headers: { Authorization: 'Bearer token-2' },
        });
      });
    });
  });
});
