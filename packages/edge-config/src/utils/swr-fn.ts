import { clone } from './clone';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- any necessary for generics */

/**
 * Adds swr behavior to any async function.
 *
 * This function can wrap any function like swr(fn) to produce a new function
 * which will have stales-while-revalidate semantics per set of arguments passed.
 *
 * This means any subsequent call to this function will return the previous value,
 * for the given set of arguments. And will kick off refreshing the latest value
 * in the background for the next call.
 *
 * If the background refresh has not returned while a new call is made then the
 * stale value is returned for that next call as well.
 *
 * Argument equality is checked by stringifying.
 */
export function swr<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  // A record of arguments and their in-flight values
  //
  // We also cache the invocationId to ensure we never replace a newer refreshed
  // value with an older one
  //
  // we cache by arguments to prevent calls to the fn with different arguments
  // from returning the same result
  const cache: Record<
    string,
    { staleValuePromise: null | Promise<unknown>; latestInvocationId: number }
  > = {};

  return (async (...args: any[]) => {
    const cacheKey = JSON.stringify(args);
    let cached = cache[cacheKey];
    if (!cached) {
      cached = { latestInvocationId: 0, staleValuePromise: null };
      cache[cacheKey] = cached;
    }
    const currentInvocationId = ++cached.latestInvocationId;

    if (cached.staleValuePromise) {
      void fn(...args).then(
        (result) => {
          if (currentInvocationId === cached?.latestInvocationId) {
            cached.staleValuePromise = Promise.resolve(result);
          }
        },
        () => void 0,
      );

      // clone to avoid referential equality of the returned value,
      // which would unlock mutations
      return cached.staleValuePromise.then(clone);
    }

    const resultPromise = fn(...args);
    cached.staleValuePromise = resultPromise.then(clone, (e) => {
      if (cached) cached.staleValuePromise = null;
      throw e;
    });
    return resultPromise.then(clone);
  }) as T;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- reenabling the rule */
