let blockedBoundary: null | Promise<void> = null;

function getCurrentBoundary(): Promise<void> {
  if (blockedBoundary) {
    return blockedBoundary;
  }
  blockedBoundary = new Promise((resolve) => {
    // We use setTimeout intentionally even in Node.js environments to ensure these
    // are tracked as IO by React in Server Component environments.
    // TODO implement a Next.js specific version so we can skip this boundary checking
    // except where needed.
    setTimeout(() => {
      blockedBoundary = null;
      resolve();
    }, 0);
  });
  return blockedBoundary;
}

/**
 * Wraps an async function to ensure that it will always yield to the event loop before
 * resolving or rejecting.
 */
export function withIOBoundary<
  /* eslint-disable @typescript-eslint/no-explicit-any -- we're wrapping */
  F extends (...args: any[]) => Promise<any>,
>(fn: F): F {
  async function bounded(this: unknown, ...args: unknown[]): Promise<unknown> {
    await getCurrentBoundary();
    return fn.call(this, ...args);
  }

  try {
    Object.defineProperty(bounded, 'name', { value: fn.name });
  } catch {
    // best effort
  }
  try {
    Object.defineProperty(bounded, 'toString', { value: fn.toString.bind(fn) });
  } catch {
    // best effort
  }

  return bounded as F;
}
