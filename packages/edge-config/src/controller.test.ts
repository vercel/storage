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

// eslint-disable-next-line jest/require-top-level-describe -- [@vercel/style-guide@5 migration]
beforeEach(() => {
  fetchMock.resetMocks();
});

describe('controller', () => {
  it('should work', async () => {
    const controller = new Controller(connection, {}, false);

    setTimestampOfLatestUpdate(1000);

    fetchMock.mockResponse(JSON.stringify('value1'), {
      headers: {
        'x-edge-config-digest': 'digest1',
        'x-edge-config-updated-at': '1000',
      },
    });

    // blocking fetch first
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      source: 'MISS',
    });

    // cache HIT after
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      source: 'HIT',
    });

    // should not fetch again
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // should refresh in background and serve stale value
    setTimestampOfLatestUpdate(7000);
    fetchMock.mockResponse(JSON.stringify('value2'), {
      headers: {
        'x-edge-config-digest': 'digest2',
        'x-edge-config-updated-at': '7000',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      source: 'STALE',
    });

    // should fetch again in background
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // run event loop once
    await Promise.resolve();

    // should now serve the stale value
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      source: 'HIT',
    });

    // exceeds stale threshold should lead to cache MISS and blocking fetch
    setTimestampOfLatestUpdate(17001);
    fetchMock.mockResponse(JSON.stringify('value3'), {
      headers: {
        'x-edge-config-digest': 'digest3',
        'x-edge-config-updated-at': '17001',
      },
    });

    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value3',
      digest: 'digest3',
      source: 'MISS',
    });

    // needs to fetch again
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should dedupe within a version', async () => {
    const controller = new Controller(connection, {}, false);

    setTimestampOfLatestUpdate(1000);

    const { promise, resolve } = Promise.withResolvers<Response>();

    fetchMock.mockResolvedValueOnce(promise);

    // blocking fetches first, which should get deduped
    const read1 = controller.get('key1');
    const read2 = controller.get('key1');

    resolve(
      new Response(JSON.stringify('value1'), {
        headers: {
          'x-edge-config-digest': 'digest1',
          'x-edge-config-updated-at': '1000',
        },
      }),
    );

    await expect(read1).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      source: 'MISS',
    });

    // reuses the pending fetch promise
    await expect(read2).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      source: 'MISS',
    });

    // hits the cache
    const read3 = controller.get('key1');
    await expect(read3).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      source: 'HIT',
    });

    //
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
