import fetchMock from 'jest-fetch-mock';
import { version } from '../package.json';
import { Controller } from './controller';
import type { Connection } from './types';
import { readBuildEmbeddedEdgeConfig } from './utils/mockable-import';

const packageVersion = `@vercel/edge-config@${version}`;

jest.useFakeTimers();

jest.mock('./utils/mockable-import', () => ({
  readBuildEmbeddedEdgeConfig: jest.fn(() => {
    throw new Error('not implemented');
  }),
}));

const connection: Connection = {
  baseUrl: 'https://edge-config.vercel.com',
  id: 'ecfg_FAKE_EDGE_CONFIG_ID',
  token: 'fake-edge-config-token',
  version: '1',
  type: 'vercel',
};

// Helper function to mock the privateEdgeConfigSymbol in globalThis
function setTimestampOfLatestUpdate(
  timestamp: number | null | undefined,
): void {
  const privateEdgeConfigSymbol = Symbol.for('privateEdgeConfig');

  if (timestamp === null || timestamp === undefined) {
    Reflect.set(globalThis, privateEdgeConfigSymbol, {
      getUpdatedAt: (_id: string) => null,
    });
  } else {
    Reflect.set(globalThis, privateEdgeConfigSymbol, {
      getUpdatedAt: (_id: string) => timestamp,
    });
  }
}

// the "it" tests in the lifecycle are run sequentially, so their order matters
describe('lifecycle: reading a single item', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentStream: false,
  });

  it('should MISS the cache initially', async () => {
    jest.setSystemTime(1000);
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
      exists: true,
      updatedAt: 1000,
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
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should HIT the cache if the timestamp has not changed', async () => {
    jest.setSystemTime(1100);
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'HIT',
      exists: true,
      updatedAt: 1000,
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should serve a stale value if the timestamp has changed but is within the threshold', async () => {
    jest.setSystemTime(7100);
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
      exists: true,
      updatedAt: 1000,
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
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should serve the new value from cache after the background refresh completes', async () => {
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'HIT',
      exists: true,
      updatedAt: 7000,
    });
  });

  it('should not fire off any subsequent background refreshes', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should refresh when the stale threshold is exceeded', async () => {
    jest.setSystemTime(18001);
    setTimestampOfLatestUpdate(8000);
    fetchMock.mockResponseOnce(JSON.stringify('value3'), {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '8000',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value3',
      digest: 'digest3',
      cache: 'MISS',
      exists: true,
      updatedAt: 8000,
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
          'x-edge-config-min-updated-at': '8000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
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
    enableDevelopmentStream: false,
  });

  it('should MISS the cache initially', async () => {
    jest.setSystemTime(1100);
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce(JSON.stringify({ key1: 'value1' }), {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
        etag: '"digest1"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1' },
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
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
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should HIT the cache if the timestamp has not changed', async () => {
    jest.setSystemTime(20000);
    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1' },
      digest: 'digest1',
      cache: 'HIT',
      updatedAt: 1000,
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should serve a stale value if the timestamp has changed but is within the threshold', async () => {
    // latest update was less than 10 seconds ago, so we can serve stale value
    jest.setSystemTime(27000);
    setTimestampOfLatestUpdate(20000);
    fetchMock.mockResponseOnce(JSON.stringify({ key1: 'value2' }), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '20000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1' },
      digest: 'digest1',
      cache: 'STALE',
      updatedAt: 1000,
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
          'x-edge-config-min-updated-at': '20000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should serve the new value from cache after the background refresh completes', async () => {
    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value2' },
      digest: 'digest2',
      cache: 'HIT',
      updatedAt: 20000,
    });
  });

  it('should not fire off any subsequent background refreshes', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should refresh when the stale threshold is exceeded', async () => {
    jest.setSystemTime(30002);
    setTimestampOfLatestUpdate(20001);
    fetchMock.mockResponseOnce(JSON.stringify({ key1: 'value3' }), {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '20001',
      },
    });

    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value3' },
      digest: 'digest3',
      cache: 'MISS',
      updatedAt: 20001,
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
          'x-edge-config-min-updated-at': '20001',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
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
    enableDevelopmentStream: false,
  });

  it('should MISS the cache initially', async () => {
    jest.setSystemTime(1100);
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
      updatedAt: 1000,
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
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should HIT the cache if the timestamp has not changed', async () => {
    jest.setSystemTime(20000);
    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'HIT',
      updatedAt: 1000,
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should serve a stale value if the timestamp has changed but is within the threshold', async () => {
    jest.setSystemTime(27000);
    setTimestampOfLatestUpdate(20000);

    // pretend key1 does not exist anymore so we can check has() uses the stale value
    fetchMock.mockResponseOnce('', {
      status: 404,
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '20000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'STALE',
      updatedAt: 1000,
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
          'x-edge-config-min-updated-at': '20000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should serve the new value from cache after the background refresh completes', async () => {
    await expect(controller.has('key1')).resolves.toEqual({
      exists: false,
      digest: 'digest2',
      cache: 'HIT',
      updatedAt: 20000,
      value: undefined,
    });
  });

  it('should not fire off any subsequent background refreshes', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should refresh when the stale threshold is exceeded', async () => {
    jest.setSystemTime(40000);
    setTimestampOfLatestUpdate(21000);
    fetchMock.mockResponseOnce('', {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '21000',
      },
    });

    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest3',
      cache: 'MISS',
      updatedAt: 21000,
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
          'x-edge-config-min-updated-at': '21000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
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
    enableDevelopmentStream: false,
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
      exists: true,
      updatedAt: 1000,
    });
  });

  it('should reuse the existing promise', async () => {
    await expect(promisedValue2).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
      exists: true,
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
      updatedAt: 1000,
      exists: true,
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
    enableDevelopmentStream: false,
  });

  it('should fetch twice when the timestamp changes', async () => {
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
      updatedAt: 1000,
      exists: true,
    });

    read2.resolve(
      new Response(JSON.stringify('value2'), {
        headers: {
          'x-edge-config-digest': 'digest2',
          'x-edge-config-updated-at': '1001',
        },
      }),
    );

    await expect(promisedValue2).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'MISS',
      updatedAt: 1001,
      exists: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('development cache: get', () => {
  const controller = new Controller(connection, {
    enableDevelopmentStream: true,
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
      exists: true,
      updatedAt: 1000,
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
      exists: true,
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(promise2).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'MISS',
      exists: true,
      updatedAt: 1000,
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
      updatedAt: 1000,
      exists: true,
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/item/key1?version=1',
      {
        method: 'GET',
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'If-None-Match': '"digest2"',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
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
      exists: true,
      updatedAt: 1001,
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
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('development cache: has', () => {
  const controller = new Controller(connection, {
    enableDevelopmentStream: true,
  });
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  it('should fetch initially', async () => {
    setTimestampOfLatestUpdate(undefined);
    fetchMock.mockResponseOnce('', {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
      },
    });

    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should not fetch when another fetch is pending', async () => {
    fetchMock.mockResponseOnce('', {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '1000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    // run them in parallel so the deduplication can take action
    const [promise1, promise2] = [
      controller.has('key1'),
      controller.has('key1'),
    ];

    await expect(promise1).resolves.toEqual({
      digest: 'digest2',
      cache: 'MISS',
      exists: true,
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(promise2).resolves.toEqual({
      exists: true,
      digest: 'digest2',
      cache: 'MISS',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('lifecycle: mixing get, has and all', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentStream: false,
  });

  it('get(key1) should MISS the cache initially', async () => {
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
      updatedAt: 1000,
      exists: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('has(key1) should HIT the cache subsequently', async () => {
    await expect(controller.has('key1')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'HIT',
      updatedAt: 1000,
      value: 'value1', // we have the value from the previous GET call
    });
    // still one
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('has(key2) should MISS the cache initially', async () => {
    fetchMock.mockResponseOnce('', {
      status: 404,
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
        etag: '"digest1"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.has('key2')).resolves.toEqual({
      exists: false,
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
      value: undefined,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('get(key2) should HIT the cache subsequently', async () => {
    // in this case GET knows that the value does not exist,
    // so it does not need to perform a fetch at all since
    // there is no such item
    setTimestampOfLatestUpdate(1000);
    await expect(controller.get('key2')).resolves.toEqual({
      value: undefined,
      digest: 'digest1',
      cache: 'HIT',
      exists: false,
      updatedAt: 1000,
    });
    // still two
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('has(key3) should MISS the cache initially', async () => {
    fetchMock.mockResponseOnce(JSON.stringify('value3'), {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
        etag: '"digest1"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.has('key3')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
      value: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('get(key3) should MISS the cache subsequently', async () => {
    fetchMock.mockResponseOnce(JSON.stringify('value3'), {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
        etag: '"digest1"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('key3')).resolves.toEqual({
      exists: true,
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
      value: 'value3',
    });
    // still one
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('lifecycle: reading multiple items without full edge config cache', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentStream: false,
  });

  it('should MISS the cache initially', async () => {
    jest.setSystemTime(1100);
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1', key2: 'value2' }),
      {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
          etag: '"digest1"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2' },
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
    });
  });

  it('should have performed a blocking fetch to resolve the cache MISS', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/items?version=1&key=key1&key=key2',
      {
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'x-edge-config-min-updated-at': '1000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should HIT the cache if the timestamp has not changed', async () => {
    jest.setSystemTime(1200);
    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2' },
      digest: 'digest1',
      cache: 'HIT',
      updatedAt: 1000,
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should serve a stale value if the timestamp has changed but is within the threshold', async () => {
    jest.setSystemTime(20000);
    setTimestampOfLatestUpdate(15000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'valueA', key2: 'valueB' }),
      {
        headers: {
          'x-edge-config-digest': 'digest2',
          'x-edge-config-updated-at': '15000',
          etag: '"digest2"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2' },
      digest: 'digest1',
      cache: 'STALE',
      updatedAt: 1000,
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
          'x-edge-config-min-updated-at': '15000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should serve the new value from cache after the background refresh completes', async () => {
    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'valueA', key2: 'valueB' },
      digest: 'digest2',
      cache: 'HIT',
      updatedAt: 15000,
    });
  });

  it('should not fire off any subsequent background refreshes', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should refresh when the stale threshold is exceeded', async () => {
    jest.setSystemTime(40000);
    setTimestampOfLatestUpdate(29000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'valueC', key2: 'valueD' }),
      {
        headers: {
          'x-edge-config-digest': 'digest3',
          'x-edge-config-updated-at': '29000',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'valueC', key2: 'valueD' },
      digest: 'digest3',
      cache: 'MISS',
      updatedAt: 29000,
    });
  });

  it('should have done a blocking refresh after the stale threshold was exceeded', () => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/items?version=1&key=key1&key=key2',
      {
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          // 'If-None-Match': '"digest1"',
          'x-edge-config-min-updated-at': '29000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });
});

describe('lifecycle: reading multiple items with full edge config cache', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentStream: false,
  });

  it('should MISS the cache initially', async () => {
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1', key2: 'value2' }),
      {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
          etag: '"digest1"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1'])).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2' },
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should load the full edge config', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1', key2: 'value2' }),
      {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
          etag: '"digest1"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2' },
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should now be possible to read key2 with a cache HIT', async () => {
    await expect(controller.mget(['key2'])).resolves.toEqual({
      value: { key2: 'value2' },
      digest: 'digest1',
      cache: 'HIT',
      updatedAt: 1000,
    });
  });

  it('should not fire off any background refreshes after the cache HIT', () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('lifecycle: reading multiple items with different updatedAt timestamps', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentStream: false,
  });

  it('should MISS the cache initially and populate item cache with different timestamps', async () => {
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
      exists: true,
      updatedAt: 1000,
    });

    // Fetch key2 with a different timestamp
    setTimestampOfLatestUpdate(2000);
    fetchMock.mockResponseOnce(JSON.stringify('value2'), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '2000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('key2')).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'MISS',
      exists: true,
      updatedAt: 2000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should fetch from server when getting multiple items with different timestamps', async () => {
    setTimestampOfLatestUpdate(3000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1a', key2: 'value2a' }),
      {
        headers: {
          'x-edge-config-digest': 'digest3',
          'x-edge-config-updated-at': '3000',
          etag: '"digest3"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'value1a', key2: 'value2a' },
      digest: 'digest3',
      cache: 'MISS',
      updatedAt: 3000,
    });

    // Should have made a new request because items have different timestamps
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/items?version=1&key=key1&key=key2',
      {
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'x-edge-config-min-updated-at': '3000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should update item cache with new unified timestamp after fetching multiple items', async () => {
    // Now both items should have the same timestamp (3000)
    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'value1a', key2: 'value2a' },
      digest: 'digest3',
      cache: 'HIT',
      updatedAt: 3000,
    });

    // Should use cached items now that they have the same timestamp
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should handle stale items with different timestamps by fetching fresh data', async () => {
    setTimestampOfLatestUpdate(15000); // Beyond stale threshold
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'valueA', key2: 'valueB' }),
      {
        headers: {
          'x-edge-config-digest': 'digest4',
          'x-edge-config-updated-at': '15000',
          etag: '"digest4"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'valueA', key2: 'valueB' },
      digest: 'digest4',
      cache: 'MISS',
      updatedAt: 15000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('should handle partial cache hits when some items have different timestamps', async () => {
    // Add a third item with yet another timestamp
    setTimestampOfLatestUpdate(18000);
    fetchMock.mockResponseOnce(JSON.stringify('value3'), {
      headers: {
        'x-edge-config-digest': 'digest5',
        'x-edge-config-updated-at': '4000',
        etag: '"digest5"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('key3')).resolves.toEqual({
      value: 'value3',
      digest: 'digest5',
      cache: 'MISS',
      exists: true,
      updatedAt: 4000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Now key1/key2 have timestamp 15000, key3 has timestamp 18000
    setTimestampOfLatestUpdate(19000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'valueX', key2: 'valueY', key3: 'valueZ' }),
      {
        headers: {
          'x-edge-config-digest': 'digest6',
          'x-edge-config-updated-at': '16000',
          etag: '"digest6"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2', 'key3'])).resolves.toEqual({
      value: { key1: 'valueX', key2: 'valueY', key3: 'valueZ' },
      digest: 'digest6',
      cache: 'MISS',
      updatedAt: 16000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe('lifecycle: reading multiple items when edge config cache is stale but individual items are not', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentStream: false,
  });

  it('should fetch the full edge config initially', async () => {
    jest.setSystemTime(1100);
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1', key2: 'value2', key3: 'value3' }),
      {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
          etag: '"digest1"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2', key3: 'value3' },
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should fetch individual items', async () => {
    jest.setSystemTime(20000);
    setTimestampOfLatestUpdate(5000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1a', key2: 'value2a', key3: 'value3a' }),
      {
        headers: {
          'x-edge-config-digest': 'digest2',
          'x-edge-config-updated-at': '5000',
          etag: '"digest1"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2', 'key3'])).resolves.toEqual({
      value: { key1: 'value1a', key2: 'value2a', key3: 'value3a' },
      digest: 'digest2',
      cache: 'MISS',
      updatedAt: 5000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should HIT the item cache if the timestamp has not changed', async () => {
    await expect(controller.mget(['key1', 'key2', 'key3'])).resolves.toEqual({
      value: { key1: 'value1a', key2: 'value2a', key3: 'value3a' },
      digest: 'digest2',
      cache: 'HIT',
      updatedAt: 5000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should serve STALE values from the item cache if the timestamp has changed but is within the threshold', async () => {
    jest.setSystemTime(31000);
    setTimestampOfLatestUpdate(30000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1b', key2: 'value2b', key3: 'value3b' }),
      {
        headers: {
          'x-edge-config-digest': 'digest3',
          'x-edge-config-updated-at': '30000',
          etag: '"digest3"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2', 'key3'])).resolves.toEqual({
      value: { key1: 'value1a', key2: 'value2a', key3: 'value3a' },
      cache: 'STALE',
      updatedAt: 5000,
      digest: 'digest2',
    });
  });

  it('should trigger a full background refresh after the STALE value', () => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://edge-config.vercel.com/items?version=1',
      {
        cache: 'no-store',
        headers: new Headers({
          Authorization: 'Bearer fake-edge-config-token',
          'x-edge-config-min-updated-at': '30000',
          'x-edge-config-sdk': packageVersion,
          'x-edge-config-vercel-env': 'test',
        }),
      },
    );
  });

  it('should hit the cache if no more updates were made', async () => {
    jest.setSystemTime(32000);
    await expect(controller.mget(['key1', 'key2', 'key3'])).resolves.toEqual({
      value: { key1: 'value1b', key2: 'value2b', key3: 'value3b' },
      cache: 'HIT',
      updatedAt: 30000,
      digest: 'digest3',
    });
  });
});

describe('lifecycle: reading multiple items when the item cache is stale but the edge config cache is not', () => {
  beforeAll(() => {
    fetchMock.resetMocks();
  });

  const controller = new Controller(connection, {
    enableDevelopmentStream: false,
  });

  it('should fetch multiple items', async () => {
    jest.setSystemTime(1100);
    setTimestampOfLatestUpdate(1000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1', key2: 'value2' }),
      {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
          etag: '"digest1"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2'])).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2' },
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should fetch the full edge config even if there are fresh items in the item cache', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1', key2: 'value2', key3: 'value3' }),
      {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
          etag: '"digest1"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2', key3: 'value3' },
      digest: 'digest1',
      cache: 'MISS',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should HIT the cache if the timestamp has not changed when reading individual items', async () => {
    await expect(controller.mget(['key1', 'key2', 'key3'])).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2', key3: 'value3' },
      digest: 'digest1',
      cache: 'HIT',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should HIT the cache if the timestamp has not changed when reading the full config', async () => {
    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2', key3: 'value3' },
      digest: 'digest1',
      cache: 'HIT',
      updatedAt: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should serve STALE values when the edge config changes', async () => {
    jest.setSystemTime(25000);
    setTimestampOfLatestUpdate(20000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1b', key2: 'value2b', key3: 'value3b' }),
      {
        headers: {
          'x-edge-config-digest': 'digest2',
          'x-edge-config-updated-at': '20000',
          etag: '"digest2"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1', key2: 'value2', key3: 'value3' },
      digest: 'digest1',
      cache: 'STALE',
      updatedAt: 1000,
    });

    // background refresh
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should hit the cache on subsequent reads', async () => {
    await expect(controller.all()).resolves.toEqual({
      value: { key1: 'value1b', key2: 'value2b', key3: 'value3b' },
      digest: 'digest2',
      cache: 'HIT',
      updatedAt: 20000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should serve STALE values from the edge config cache', async () => {
    jest.setSystemTime(24000);
    setTimestampOfLatestUpdate(23000);
    fetchMock.mockResponseOnce(
      JSON.stringify({ key1: 'value1c', key2: 'value2c', key3: 'value3c' }),
      {
        headers: {
          'x-edge-config-digest': 'digest3',
          'x-edge-config-updated-at': '23000',
          etag: '"digest3"',
          'content-type': 'application/json',
        },
      },
    );

    await expect(controller.mget(['key1', 'key2', 'key3'])).resolves.toEqual({
      value: { key1: 'value1b', key2: 'value2b', key3: 'value3b' },
      digest: 'digest2',
      cache: 'STALE',
      updatedAt: 20000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('preloading', () => {
  beforeEach(() => {
    (readBuildEmbeddedEdgeConfig as jest.Mock).mockReset();
    fetchMock.resetMocks();
  });

  it('should use the preloaded value is up to date', async () => {
    const controller = new Controller(connection, {
      enableDevelopmentStream: false,
    });

    // most recent update was only 1s ago, so we can serve the preloaded value
    // as we are within the maxStale threshold
    jest.setSystemTime(21000);
    setTimestampOfLatestUpdate(20000);

    (readBuildEmbeddedEdgeConfig as jest.Mock).mockImplementationOnce(() => {
      return Promise.resolve({
        default: {
          items: { key1: 'value-preloaded' },
          updatedAt: 20000,
          digest: 'digest-preloaded',
        },
      });
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value-preloaded',
      digest: 'digest-preloaded',
      cache: 'HIT',
      exists: true,
      updatedAt: 20000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(readBuildEmbeddedEdgeConfig).toHaveBeenCalledTimes(1);
  });

  it('should use the preloaded value if stale within the maxStale threshold', async () => {
    const controller = new Controller(connection, {
      enableDevelopmentStream: false,
    });

    // most recent update was only 1s ago, so we can serve the preloaded value
    // as we are within the maxStale threshold
    jest.setSystemTime(21000);
    setTimestampOfLatestUpdate(20000);

    fetchMock.mockResponseOnce(JSON.stringify('value2'), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '20000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    (readBuildEmbeddedEdgeConfig as jest.Mock).mockImplementationOnce(() => {
      return Promise.resolve({
        default: {
          items: { key1: 'value-preloaded' },
          updatedAt: 1000,
          digest: 'digest-preloaded',
        },
      });
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value-preloaded',
      digest: 'digest-preloaded',
      cache: 'STALE',
      exists: true,
      updatedAt: 1000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readBuildEmbeddedEdgeConfig).toHaveBeenCalledTimes(1);
  });

  it('should not use the preloaded value if the cache is expired', async () => {
    // most recent update was 11s ago, so we need to fetch fresh data
    // as we are outside the maxStale threshold
    jest.setSystemTime(31000);
    setTimestampOfLatestUpdate(20000);

    const controller = new Controller(connection, {
      enableDevelopmentStream: false,
    });

    (readBuildEmbeddedEdgeConfig as jest.Mock).mockImplementationOnce(() => {
      return Promise.resolve({
        default: {
          items: { keyA: 'value1' },
          // more than 10s old, with a newer update available that's only 1s old
          updatedAt: 1000,
          digest: 'digest1',
        },
      });
    });

    fetchMock.mockResponseOnce(JSON.stringify('value2'), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '20000',
        etag: '"digest2"',
        'content-type': 'application/json',
      },
    });

    await expect(controller.get('keyA')).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      cache: 'MISS',
      exists: true,
      updatedAt: 20000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readBuildEmbeddedEdgeConfig).toHaveBeenCalledTimes(1);
  });
});
