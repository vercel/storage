import defaultKv, { kv, VercelKV, createClient } from '.';

let scanReturnValues: [string, string[]][] = [['0', []]];
jest.mock('@upstash/redis', () => ({
  Redis: jest.fn(() => ({
    get: jest.fn().mockResolvedValue('bar'),
    scan: jest
      .fn()
      .mockImplementation(() => Promise.resolve(scanReturnValues.shift())),
    // eslint-disable-next-line jest/unbound-method -- [@vercel/style-guide@5 migration]
    scanIterator: VercelKV.prototype.scanIterator,
  })),
}));

describe('@vercel/kv', () => {
  beforeEach(() => {
    scanReturnValues = [['0', []]];
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
        ['2', ['1', '2']],
        ['4', ['3', '4']],
        ['0', []],
      ];
      const client = createClient({ url: 'foobar', token: 'foobar' });
      const returnedKeys: string[] = [];
      for await (const key of client.scanIterator()) {
        returnedKeys.push(key);
      }
      expect(returnedKeys).toEqual(['1', '2', '3', '4']);
    });
  });
});
