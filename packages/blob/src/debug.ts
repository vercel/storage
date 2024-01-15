let debugIsActive = false;

// wrapping this code in a try/catch in case some env doesn't support process.env (vite by default)
try {
  if (
    process.env.DEBUG?.includes('blob') ||
    process.env.NEXT_PUBLIC_DEBUG?.includes('blob')
  ) {
    debugIsActive = true;
  }
} catch (error) {
  // noop
}

// Set process.env.DEBUG = 'blob' to enable debug logging
export function debug(message: string, ...args: unknown[]): void {
  if (debugIsActive) {
    // eslint-disable-next-line no-console -- Ok for debugging
    console.debug(`vercel-blob: ${message}`, ...args);
  }
}
