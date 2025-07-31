import fetchMock from 'jest-fetch-mock';
import { Controller, setTimestampOfLatestUpdate } from './controller';
import type { Connection } from './types';

const connection: Connection = {
  baseUrl: 'https://edge-config.vercel.com',
  id: 'ecfg_FAKE_EDGE_CONFIG_ID',
  token: 'fake-edge-config-token',
  version: '1',
  type: 'vercel',
};

// the "it" tests in the lifecycle are run sequentially, so their order matters
describe('lifecycle: reading a single item', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentCache: false,
  });

  it('should MISS the cache initially', async () => {
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce(JSON.stringify('value1'), {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
        etag: '"digest1"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'MISS',
    });
  });

  it('should have performed a blocking fetch to resolve the cache MISS', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'GET',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'x-edge-config-min-updated-at': '1000',
        }),
      },
    );
  });

  it('should HIT the cache if the timestamp has not changed', async () => {
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'HIT',
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should serve a stale value if the timestamp has changed but is within the threshold', async () => {
    setTimestampOfLatestUpdate(7000);
    fetchMock.mockResponseOnce(JSON.stringify('value2'), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '7000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'STALE',
    });
  });

  it('should trigger a background refresh after the STALE value', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'GET',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          // 'If-None-Match': '"digest1"',
          'x-edge-config-min-updated-at': '7000',
        }),
      },
    );
  });

  it('should serve the new value from cache after the background refresh completes', async () => {
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'HIT',
    });
  });

  it('should not fire off any subsequent background refreshes', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should refresh when the stale threshold is exceeded', async () => {
    setTimestampOfLatestUpdate(17001);
    fetchMock.mockResponseOnce(JSON.stringify('value3'), {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '17001',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value3',
      digest: 'digest3',
      cache: 'MISS',
    });
  });

  it('should have done a blocking refresh after the stale threshold was exceeded', () => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'GET',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          // 'If-None-Match': '"digest1"',
          'x-edge-config-min-updated-at': '17001',
        }),
      },
    );
  });
});

describe('lifecycle: reading the full config', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentCache: false,
  });

  it('should MISS the cache initially', async () => {
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce(JSON.stringify({ key1: 'value1' }), {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
        etag: '"digest1"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.getAll()).resolves.toEqual({
      value: { key1: 'value1' },
      digest: 'digest1',
      cache: 'MISS',
    });
  });

  it('should have performed a blocking fetch to resolve the cache MISS', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/items?version=1',
      {
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'x-edge-config-min-updated-at': '1000',
        }),
      },
    );
  });

  it('should HIT the cache if the timestamp has not changed', async () => {
    await expect(controller.getAll()).resolves.toEqual({
      value: { key1: 'value1' },
      digest: 'digest1',
      cache: 'HIT',
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should serve a stale value if the timestamp has changed but is within the threshold', async () => {
    setTimestampOfLatestUpdate(7000);
    fetchMock.mockResponseOnce(JSON.stringify({ key1: 'value2' }), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '7000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.getAll()).resolves.toEqual({
      value: { key1: 'value1' },
      digest: 'digest1',
      cache: 'STALE',
    });
  });

  it('should trigger a background refresh after the STALE value', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/items?version=1',
      {
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          // 'If-None-Match': '"digest1"',
          'x-edge-config-min-updated-at': '7000',
        }),
      },
    );
  });

  it('should serve the new value from cache after the background refresh completes', async () => {
    await expect(controller.getAll()).resolves.toEqual({
      value: { key1: 'value2' },
      digest: 'digest2',
      cache: 'HIT',
    });
  });

  it('should not fire off any subsequent background refreshes', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should refresh when the stale threshold is exceeded', async () => {
    setTimestampOfLatestUpdate(17001);
    fetchMock.mockResponseOnce(JSON.stringify({ key1: 'value3' }), {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '17001',
      },
    });

    await expect(controller.getAll()).resolves.toEqual({
      value: { key1: 'value3' },
      digest: 'digest3',
      cache: 'MISS',
    });
  });

  it('should have done a blocking refresh after the stale threshold was exceeded', () => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/items?version=1',
      {
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          // 'If-None-Match': '"digest1"',
          'x-edge-config-min-updated-at': '17001',
        }),
      },
    );
  });
});

describe('lifecycle: checking existence of a single item', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentCache: false,
  });

  it('should MISS the cache initially', async () => {
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce('', {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
        etag: '"digest1"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'MISS',
    });
  });

  it('should have performed a blocking fetch to resolve the cache MISS', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'HEAD',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'x-edge-config-min-updated-at': '1000',
        }),
      },
    );
  });

  it('should HIT the cache if the timestamp has not changed', async () => {
    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'HIT',
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should serve a stale exitence value if the timestamp has changed but is within the threshold', async () => {
    setTimestampOfLatestUpdate(7000);
    fetchMock.mockResponseOnce('', {
      status: 404,
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '7000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'STALE',
    });
  });

  it('should trigger a background refresh after the STALE value', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'HEAD',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'x-edge-config-min-updated-at': '7000',
        }),
      },
    );
  });

  it('should serve the new value from cache after the background refresh completes', async () => {
    await expect(controller.has('key1')).resolves.toEqual({
      exists: false,
      digest: 'digest2',
      cache: 'HIT',
    });
  });

  it('should not fire off any subsequent background refreshes', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should refresh when the stale threshold is exceeded', async () => {
    setTimestampOfLatestUpdate(17001);
    fetchMock.mockResponseOnce('', {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '17001',
      },
    });

    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest3',
      cache: 'MISS',
    });
  });

  it('should have done a blocking refresh after the stale threshold was exceeded', () => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'HEAD',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          // 'If-None-Match': '"digest1"',
          'x-edge-config-min-updated-at': '17001',
        }),
      },
    );
  });
});

describe('deduping within a version', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });
  const controller = new Controller(connection, {
    enableDevelopmentCache: false,
  });

  // let promisedValue1: ReturnType<typeof controller.get>;
  let promisedValue2: ReturnType<typeof controller.get>;

  it('should only fetch once given the same request', async () => {
    setTimestampOfLatestUpdate(1000);
    const resolvers = Promise.withResolvers<Response>();

    fetchMock.mockResolvedValueOnce(resolvers.promise);

    // blocking fetches first, which should get deduped
    const promisedValue1 = controller.get('key1');
    // fetch again before resolving promise of the first fetch
    promisedValue2 = controller.get('key1');

    resolvers.resolve(
      new Response(JSON.stringify('value1'), {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
        },
      }),
    );

    await expect(promisedValue1).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'MISS',
    });
  });

  it('should reuse the existing promise', async () => {
    await expect(promisedValue2).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'MISS',
    });
  });

  it('should only have fetched once due to deduping', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should hit the cache on subsequent reads without refetching', async () => {
    const read3 = controller.get('key1');
    await expect(read3).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'HIT',
    });
  });

  it('should not trigger a new background refresh', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('bypassing dedupe when the timestamp changes', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });
  const controller = new Controller(connection, {
    enableDevelopmentCache: false,
  });

  it('should only fetch once given the same request', async () => {
    setTimestampOfLatestUpdate(1000);
    const read1 = Promise.withResolvers<Response>();
    const read2 = Promise.withResolvers<Response>();

    fetchMock.mockResolvedValueOnce(read1.promise);
    fetchMock.mockResolvedValueOnce(read2.promise);

    // blocking fetches first, which should get deduped
    const promisedValue1 = controller.get('key1');
    setTimestampOfLatestUpdate(1001);
    const promisedValue2 = controller.get('key1');

    read1.resolve(
      new Response(JSON.stringify('value1'), {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
        },
      }),
    );

    await expect(promisedValue1).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'MISS',
    });

    read2.resolve(
      new Response(JSON.stringify('value2'), {
        headers: {
          'x-edge-config-digest': 'digest2',
          'x-edge-config-updated-at': '1001',
        },
      }),
    );

    // reuses the pending fetch promise
    await expect(promisedValue2).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'MISS',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('development cache', () => {
  const controller = new Controller(connection, {
    enableDevelopmentCache: true,
  });
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  it('should fetch initially', async () => {
    setTimestampOfLatestUpdate(undefined);
    fetchMock.mockResponseOnce(JSON.stringify('value1'), {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'MISS',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should not fetch when another fetch is pending', async () => {
    fetchMock.mockResponseOnce(JSON.stringify('value2'), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '1000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    // run them in parallel so the deduplication can take action
    const [promise1, promise2] = [
      controller.get('key1'),
      controller.get('key1'),
    ];

    await expect(promise1).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'MISS',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(promise2).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'MISS',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should use the etag http cache', async () => {
    fetchMock.mockResponseOnce('', {
      status: 304,
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '1000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      // hits the etag http cache, but misses the in-memory cache, so it's a MISS
      cache: 'MISS',
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'GET',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'If-None-Match': '"digest2"',
        }),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should return the latest value when the etag changes', async () => {
    fetchMock.mockResponseOnce(JSON.stringify('value3'), {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '1001',
        // a newer etag will be returned
        etag: '"digest3"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value3',
      digest: 'digest3',
      cache: 'MISS',
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'GET',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          // we query with the older etag we had in memory
          'If-None-Match': '"digest2"',
        }),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
