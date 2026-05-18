type Context = {
  headers?: Record<string, string | undefined>;
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

const getContext = (): Context => {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;

  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
};

function readEnv(name: string): string | undefined {
  try {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Gets the current OIDC token from request context headers or environment.
 */
export function getVercelOidcToken(): string | undefined {
  const tokenFromContext = getContext().headers?.['x-vercel-oidc-token'];
  if (typeof tokenFromContext === 'string' && tokenFromContext.trim() !== '') {
    return tokenFromContext.trim();
  }

  return readEnv('VERCEL_OIDC_TOKEN');
}
