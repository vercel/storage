import { swr } from './swr-fn';

const delay = (ms = 500): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
    let resolve: null | ((value: string) => void) = null;
    const p = new Promise((r) => {
      resolve = r;
    });
    fn.mockReturnValue(p);
    await expect(swrFn()).resolves.toEqual('a');
    // @ts-expect-error -- will be defined
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
});
