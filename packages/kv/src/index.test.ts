import defaultKv, { kv, VercelKV, createClient } from '.';

let scanReturnValues: [number, string[]][] = [[0, []]];
let hscanReturnValues: [number, (string | number)[]][] = [[0, []]];

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn(() => ({
    get: jest.fn().mockResolvedValue('bar'),
    scan: jest
      .fn()
      .mockImplementation(() => Promise.resolve(scanReturnValues.shift())),
    hscan: jest
      .fn()
      .mockImplementation(() => Promise.resolve(hscanReturnValues.shift())),
    /* eslint-disable jest/unbound-method -- [@vercel/style-guide@5 migration] */
    scanIterator: VercelKV.prototype.scanIterator,
    hscanIterator: VercelKV.prototype.hscanIterator,
    /* eslint-enable jest/unbound-method -- [@vercel/style-guide@5 migration] */
  })),
}));

describe('@vercel/kv', () => {
  beforeEach(() => {
    scanReturnValues = [[0, []]];
    jest.clearAllMocks();
  });

  describe('kv export', () => {
    it('exports "kv" client', async () => {
      process.env.KV_REST_API_URL =
        'https://foobar-6739.redis.vercel-storage.com';
      process.env.KV_REST_API_TOKEN = 'tok_foobar';

      expect(await kv.get('foo')).toEqual('bar');

      process.env.KV_REST_API_URL = undefined;
      process.env.KV_REST_API_TOKEN = undefined;
    });

    it('exports default legacy client', async () => {
      process.env.KV_REST_API_URL =
        'https://foobar-6739.redis.vercel-storage.com';
      process.env.KV_REST_API_TOKEN = 'tok_foobar';

      expect(await defaultKv.get('foo')).toEqual('bar');

      process.env.KV_REST_API_URL = undefined;
      process.env.KV_REST_API_TOKEN = undefined;
    });

    it('should load awaited default module (Vite use case', async () => {
      const kvModule = await import('.').then((m) => m.default);

      process.env.KV_REST_API_URL =
        'https://foobar-6739.redis.vercel-storage.com';
      process.env.KV_REST_API_TOKEN = 'tok_foobar';

      expect(await kvModule.get('foo')).toEqual('bar');

      process.env.KV_REST_API_URL = undefined;
      process.env.KV_REST_API_TOKEN = undefined;
    });
  });

  describe('createClient', () => {
    it('creates a client', async () => {
      const client = createClient({ url: 'foobar', token: 'foobar' });

      expect(await client.get('foo')).toEqual('bar');
    });
  });

  describe('scanIterator', () => {
    it('terminates iteration for trivial case', async () => {
      const client = new VercelKV({ url: 'foobar', token: 'foobar' });
      const iterator = client.scanIterator();

      expect(iterator[Symbol.asyncIterator]).toBeTruthy();
      const returnedKeys: string[] = [];
      for await (const key of iterator) {
        returnedKeys.push(key);
      }
      expect(returnedKeys).toEqual([]);
    });

    it('supports iteration', async () => {
      scanReturnValues = [
        [2, ['1', '2']],
        [4, ['3', '4']],
        [0, []],
      ];
      const client = createClient({ url: 'foobar', token: 'foobar' });
      const returnedKeys: string[] = [];
      for await (const key of client.scanIterator()) {
        returnedKeys.push(key);
      }
      expect(returnedKeys).toEqual(['1', '2', '3', '4']);
    });
  });

  describe('hscanIterator', () => {
    it('supports async iteration', async () => {
      hscanReturnValues = [
        [2, ['token', 'ed2bb623-ccc0-46ea-a496-88727585b6e1']],
        [1, ['visited', '2023-10-22T11:51:27.368Z']],
        [0, []],
      ];
      const client = new VercelKV({
        url: 'https://key-********-3***3.kv.vercel-storage.com',
        token: 'AX95A***gwNGY=',
      });
      const iterator = client.hscanIterator(
        'user:ed2bb623-ccc0-46ea-a496-88727585b6e1'
      );

      const expected = [
        'token',
        'ed2bb623-ccc0-46ea-a496-88727585b6e1',
        'visited',
        '2023-10-22T11:51:27.368Z',
      ];
      const received = [];

      for await (const item of iterator) received.push(item);

      expect(received).toEqual(expected);
    });
  });
});
