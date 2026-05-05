import { createRequire } from 'node:module';
import { isNodeProcess } from 'is-node-process';

type MutateResponseHeadersBeforeFlushHandler = (headers: Headers) => void;

type Context = {
  waitUntil?: (promise: Promise<unknown>) => void;
  // TODO change this to __unstable_
  mutateResponseHeadersBeforeFlush?: (
    callback: MutateResponseHeadersBeforeFlushHandler,
  ) => void;
  headers?: Record<string, string>;
  url?: string;
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

const getContext = (): Context => {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;

  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
};

/**
 * Gets the current OIDC token from the request context or the environment variable.
 *
 * Do not cache this value, as it is subject to change in production!
 *
 * This function is used to retrieve the OIDC token from the request context or the environment variable.
 * It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.
 *
 * @returns {string} The OIDC token, or undefined if not found
 *
 * @example
 *
 * ```js
 * // Using the OIDC token
 * const token = getVercelOidcToken();
 * console.log('OIDC Token:', token);
 * ```
 */
export function getVercelOidcToken(): string | undefined {
  return (
    getContext().headers?.['x-vercel-oidc-token'] ??
    process.env.VERCEL_OIDC_TOKEN
  );
}
