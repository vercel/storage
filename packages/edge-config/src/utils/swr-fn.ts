import { trace } from './tracing';
import { clone } from './index';

/**
 * Adds swr behavior to any async function.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- any necessary for generics */
export const swr = trace(
  function swr<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    let latestInvocationId = 0;
    let staleValuePromise: null | Promise<unknown> = null;

    return (async (...args: any[]) => {
      const currentInvocationId = ++latestInvocationId;

      if (staleValuePromise) {
        // clone to avoid referential equality of the returned value,
        // which would unlock mutations
        void fn(...args).then(
          (result) => {
            if (currentInvocationId === latestInvocationId) {
              staleValuePromise = Promise.resolve(result);
            }
          },
          () => void 0,
        );
        return staleValuePromise.then(clone);
      }

      const resultPromise = fn(...args);
      staleValuePromise = resultPromise.then(clone, (e) => {
        staleValuePromise = null;
        throw e;
      });
      return resultPromise.then(clone);
    }) as T;
  },
  { name: 'swr' },
);
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- reenabling the rule */
