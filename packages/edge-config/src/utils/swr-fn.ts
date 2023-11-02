/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- any necessary for generics */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Adds swr behavior to any async function.
 */
export function swr<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  let latestInvocationId = 0;
  let staleValuePromise: null | Promise<unknown> = null;

  return (async (...args: any[]) => {
    const currentInvocationId = ++latestInvocationId;

    if (staleValuePromise) {
      // clone to avoid referential equality of the returned value,
      // which would unlock mutations
      void fn(...args).then((result) => {
        if (currentInvocationId === latestInvocationId) {
          staleValuePromise = Promise.resolve(result);
        }
      });
      return staleValuePromise.then(clone);
    }

    const resultPromise = fn(...args);
    staleValuePromise = resultPromise.catch((e) => {
      staleValuePromise = null;
      throw e;
    });
    return resultPromise;
  }) as T;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- reenabling the rule */
