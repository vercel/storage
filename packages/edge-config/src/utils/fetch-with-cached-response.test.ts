import fetchMock from 'jest-fetch-mock';
import { fetchWithCachedResponse, cache } from './fetch-with-cached-response';

describe('cache', () => {
  it('should be an object', () => {
    expect(typeof cache).toEqual('object');
  });
});

describe('fetchWithCachedResponse', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    cache.clear();
  });

  it('should cache responses and return them from cache', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ name: 'John' }), {
      headers: { ETag: 'abc123', 'content-type': 'application/json' },
    });

    // First request
    const data1 = await fetchWithCachedResponse('https://example.com/api/data');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/data', {});
    expect(data1.headers).toEqual(
      new Headers({ ETag: 'abc123', 'content-type': 'application/json' })
    );
    await expect(data1.json()).resolves.toEqual({ name: 'John' });
    expect(data1.cachedResponseBody).toBeUndefined();

    // Second request (should come from cache)
    fetchMock.mockResponseOnce('', {
      status: 304,
      headers: { ETag: 'abc123', 'content-type': 'application/json' },
    });
    const data2 = await fetchWithCachedResponse('https://example.com/api/data');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/data', {
      headers: new Headers({ 'If-None-Match': 'abc123' }),
    });
    expect(data2.headers).toEqual(
      new Headers({ ETag: 'abc123', 'content-type': 'application/json' })
    );

    expect(data2).toHaveProperty('status', 304);
    expect(data2.cachedResponseBody).toEqual({ name: 'John' });
  });

  it('should differentiate caches by authorization header', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ name: 'John' }), {
      headers: { ETag: 'abc123', 'content-type': 'application/json' },
    });

    // First request
    const data1 = await fetchWithCachedResponse(
      'https://example.com/api/data',
      {
        headers: new Headers({ authorization: 'bearer A' }),
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/data', {
      headers: new Headers({ authorization: 'bearer A' }),
    });
    expect(data1.headers).toEqual(
      new Headers({ ETag: 'abc123', 'content-type': 'application/json' })
    );
    await expect(data1.json()).resolves.toEqual({ name: 'John' });

    // Second request uses a different authorization header => do not use cache
    fetchMock.mockResponseOnce(JSON.stringify({ name: 'Bob' }), {
      headers: { ETag: 'abc123', 'content-type': 'application/json' },
    });
    const data2 = await fetchWithCachedResponse(
      'https://example.com/api/data',
      {
        // using a different authorization header here
        headers: new Headers({ authorization: 'bearer B' }),
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/data', {
      headers: new Headers({ authorization: 'bearer B' }),
    });
    expect(data2.headers).toEqual(
      new Headers({ ETag: 'abc123', 'content-type': 'application/json' })
    );
    expect(data2).toHaveProperty('status', 200);
    expect(data2.cachedResponseBody).toBeUndefined();
    await expect(data2.json()).resolves.toEqual({
      name: 'Bob',
    });

    // Third request uses same auth header as first request => use cache
    fetchMock.mockResponseOnce('', {
      status: 304,
      headers: { ETag: 'abc123', 'content-type': 'application/json' },
    });
    const data3 = await fetchWithCachedResponse(
      'https://example.com/api/data',
      {
        headers: new Headers({ authorization: 'bearer A' }),
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/data', {
      headers: new Headers({
        'If-None-Match': 'abc123',
        authorization: 'bearer A',
      }),
    });
    expect(data3.headers).toEqual(
      new Headers({ ETag: 'abc123', 'content-type': 'application/json' })
    );

    expect(data3).toHaveProperty('status', 304);
    expect(data3.cachedResponseBody).toEqual({ name: 'John' });
  });
});
