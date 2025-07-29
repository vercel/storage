import fetchMock from 'jest-fetch-mock';
import { createEnhancedFetch } from './enhanced-fetch';

describe('enhancedFetch', () => {
  let enhancedFetch: ReturnType<typeof createEnhancedFetch>;

  beforeEach(() => {
    enhancedFetch = createEnhancedFetch();
    fetchMock.resetMocks();
  });

  describe('fetch deduplication', () => {
    it('should return a function', () => {
      expect(typeof enhancedFetch).toEqual('function');
    });

    it('should deduplicate pending requests', async () => {
      const { resolve, promise } = Promise.withResolvers<Response>();
      fetchMock.mockResolvedValue(promise);
      const invocation1Promise = enhancedFetch('https://example.com/api/data');
      const invocation2Promise = enhancedFetch('https://example.com/api/data');
      const invocation3Promise = enhancedFetch('https://example.com/api/data');
      resolve(new Response(JSON.stringify({ name: 'John' })));
      const [res1, res2, res3] = await Promise.all([
        invocation1Promise,
        invocation2Promise,
        invocation3Promise,
      ]);
      expect(res1).toStrictEqual(res2);
      expect(res1).toStrictEqual(res3);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should not deduplicate after a pending request finished', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ name: 'A' }));
      fetchMock.mockResponseOnce(JSON.stringify({ name: 'B' }));
      // by awaiting res1 we essentially allow the fetch cache to clear
      const [res1] = await enhancedFetch('https://example.com/api/data');
      const [res2] = await enhancedFetch('https://example.com/api/data');
      expect(res1).not.toStrictEqual(res2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await expect(res1.json()).resolves.toEqual({ name: 'A' });
      await expect(res2.json()).resolves.toEqual({ name: 'B' });
    });

    it('should not deduplicate requests with different auth headers', async () => {
      const invocation1 = Promise.withResolvers<Response>();
      const invocation2 = Promise.withResolvers<Response>();
      fetchMock.mockResolvedValueOnce(invocation1.promise);
      fetchMock.mockResolvedValueOnce(invocation2.promise);
      const invocation1Promise = enhancedFetch('https://example.com/api/data');
      const invocation2Promise = enhancedFetch('https://example.com/api/data', {
        headers: new Headers({ Authorization: 'Bearer 1' }),
      });
      invocation1.resolve(new Response(JSON.stringify({ name: 'A' })));
      invocation2.resolve(new Response(JSON.stringify({ name: 'B' })));
      const [res1, res2] = await Promise.all([
        invocation1Promise.then(([r]) => r),
        invocation2Promise.then(([r]) => r),
      ]);
      expect(res1).not.toStrictEqual(res2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await expect(res1.json()).resolves.toEqual({ name: 'A' });
      await expect(res2.json()).resolves.toEqual({ name: 'B' });
    });

    it('should not deduplicate requests with different urls', async () => {
      const invocation1 = Promise.withResolvers<Response>();
      const invocation2 = Promise.withResolvers<Response>();
      fetchMock.mockResolvedValueOnce(invocation1.promise);
      fetchMock.mockResolvedValueOnce(invocation2.promise);
      const invocation1Promise = enhancedFetch('https://example.com/a');
      const invocation2Promise = enhancedFetch('https://example.com/b');
      invocation1.resolve(new Response(JSON.stringify({ name: 'A' })));
      invocation2.resolve(new Response(JSON.stringify({ name: 'B' })));
      const [res1, res2] = await Promise.all([
        invocation1Promise.then(([r]) => r),
        invocation2Promise.then(([r]) => r),
      ]);
      expect(res1).not.toStrictEqual(res2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await expect(res1.json()).resolves.toEqual({ name: 'A' });
      await expect(res2.json()).resolves.toEqual({ name: 'B' });
    });
  });

  describe('etag and if-none-match', () => {
    it('should return from the http cache if the response is not modified', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ name: 'A' }), {
        headers: {
          ETag: '123',
        },
      });
      fetchMock.mockResponseOnce('', {
        status: 304,
        headers: {
          ETag: '123',
        },
      });
      const [res1] = await enhancedFetch('https://example.com/api/data');
      const [, cachedRes2] = await enhancedFetch(
        'https://example.com/api/data',
      );
      expect(res1).toStrictEqual(cachedRes2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
