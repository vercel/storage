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
      source: 'network-blocking',
    });

    // cache HIT after
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value1',
      digest: 'digest1',
      source: 'cached-fresh',
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
      source: 'cached-stale',
    });

    // should fetch again in background
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // run event loop once
    await Promise.resolve();

    // should now serve the stale value
    await expect(controller.get('key1')).resolves.toEqual({
      value: 'value2',
      digest: 'digest2',
      source: 'cached-fresh',
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
      source: 'network-blocking',
    });

    // needs to fetch again
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
