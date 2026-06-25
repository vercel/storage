import { getVercelOidcToken as getVercelOidcTokenWithRefresh } from '@vercel/oidc';

/**
 * Gets the current OIDC token from the request context header or the
 * `VERCEL_OIDC_TOKEN` env var, or `undefined` when none is set.
 *
 * Delegates to `@vercel/oidc`'s `getVercelOidcToken`, which reads the
 * `x-vercel-oidc-token` request-context header (falling back to
 * `VERCEL_OIDC_TOKEN`) and throws when neither is present. Unlike the sync
 * variant, it also refreshes an expired token in a development environment. We
 * convert any throw to `undefined` so callers (see `resolveBlobAuth`) can fall
 * through to a `BLOB_READ_WRITE_TOKEN`, and treat a blank token as absent.
 *
 * Do not cache this value, as it is subject to change in production!
 */
export async function getVercelOidcToken(): Promise<string | undefined> {
  try {
    const token = (await getVercelOidcTokenWithRefresh()).trim();
    return token === '' ? undefined : token;
  } catch {
    return undefined;
  }
}
