import { getContext } from '@vercel/oidc';

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
 *
 * Uses `@vercel/oidc`'s `getContext` to read the request-context headers
 * (previously inlined here) while keeping Blob's own resolution policy: a
 * blank `x-vercel-oidc-token` header is ignored in favor of
 * `VERCEL_OIDC_TOKEN`, and values are trimmed. `@vercel/oidc`'s own token
 * readers don't trim or fall back on blank headers, so the policy stays here.
 */
export function getVercelOidcToken(): string | undefined {
  const tokenFromContext = getContext().headers?.['x-vercel-oidc-token'];
  if (typeof tokenFromContext === 'string' && tokenFromContext.trim() !== '') {
    return tokenFromContext.trim();
  }

  return readEnv('VERCEL_OIDC_TOKEN');
}
