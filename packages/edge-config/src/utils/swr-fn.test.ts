import { swr } from './swr-fn';

const delay = (ms = 500): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function lift(): [(value: string) => void, Promise<unknown>] {
  let resolve: ((value: string) => void) | undefined;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });

  if (!resolve) throw new Error('resolve not defined');
  return [resolve, promise];
}

describe('swr-fn', () => {
  it('reuses stale values', async () => {
    const fn = jest.fn();
    const swrFn = swr(fn);
    fn.mockResolvedValueOnce('a');
    await expect(swrFn()).resolves.toEqual('a');

    // here we ensure the next value resolves with "b", but
    // we expect the current call to respond with the stale value "a"
    fn.mockResolvedValueOnce('b');
    await expect(swrFn()).resolves.toEqual('a');
    fn.mockResolvedValueOnce('end');
  });

  it('returns before values resolve in the background', async () => {
    const fn = jest.fn();
    const swrFn = swr(fn);

    fn.mockResolvedValueOnce('a');
    await expect(swrFn()).resolves.toEqual('a');

    // here we only resolve the value to "b" after the second invocation,
    // and ensure the second invocation responds with the stale "a" value
    const [resolve, valuePromise] = lift();
    fn.mockReturnValue(valuePromise);
    await expect(swrFn()).resolves.toEqual('a');
    resolve('b');

    // we need to give the promise a chance to update the value before
    // the next assertion
    await delay(0);
    await expect(swrFn()).resolves.toEqual('b');
    fn.mockResolvedValueOnce('end');
  });

  it('does not store rejected promises', async () => {
    const fn = jest.fn();
    const swrFn = swr(fn);

    fn.mockResolvedValueOnce('a');
    await expect(swrFn()).resolves.toEqual('a');

    // here we fall back to the last working value
    fn.mockRejectedValueOnce('error');
    await expect(swrFn()).resolves.toEqual('a');
    fn.mockResolvedValueOnce('end');
  });

  it('does not overwrite newer values with earlier ones', async () => {
    const fn = jest.fn();
    const swrFn = swr(fn);
    const [resolveEarlier, earlierPromise] = lift();
    const [resolveLater, laterPromise] = lift();

    // initial call to fill stale value
    fn.mockResolvedValueOnce('a');
    await expect(swrFn()).resolves.toEqual('a');

    // earlier promise has not resolved yet, so it will keep using "a"
    fn.mockReturnValue(earlierPromise);
    await expect(swrFn()).resolves.toEqual('a');

    // earlier promise has not resolved yet, so it will keep using "a"
    fn.mockReturnValue(laterPromise);
    await expect(swrFn()).resolves.toEqual('a');
    resolveLater('later');
    resolveEarlier('earlier');

    await delay(0);

    // even though the "earlier" promise resolved last we will see the
    // later value, as that was the result of the most recent call
    await expect(swrFn()).resolves.toEqual('later');
    fn.mockResolvedValueOnce('end');
  });

  it('is not possible to mutate values', async () => {
    const fn = jest.fn((): Promise<string[]> => Promise.resolve([]));
    const swrFn = swr(fn);

    const list = ['a'];

    // initial call to fill stale value
    fn.mockResolvedValueOnce(list);
    const result = await swrFn();
    expect(result).toEqual(['a']);

    // mutate
    result.push('b');

    await expect(swrFn()).resolves.toEqual(['a']);
    fn.mockResolvedValueOnce([]);
  });
});
