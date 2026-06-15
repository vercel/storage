import { getVercelOidcToken } from './vercel-oidc-token';

describe('vercel-oidc-token', () => {
  const OLD_ENV = process.env;
  const REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context');

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.VERCEL_OIDC_TOKEN;
    delete (globalThis as typeof globalThis & Record<symbol, unknown>)[
      REQUEST_CONTEXT_SYMBOL
    ];
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('getVercelOidcToken returns token from env', () => {
    process.env.VERCEL_OIDC_TOKEN = 'jwt-from-env';
    expect(getVercelOidcToken()).toBe('jwt-from-env');
  });

  it('getVercelOidcToken returns undefined when no token is available', () => {
    delete process.env.VERCEL_OIDC_TOKEN;
    expect(getVercelOidcToken()).toBeUndefined();
  });

  it('getVercelOidcToken prioritizes request context headers over env', () => {
    process.env.VERCEL_OIDC_TOKEN = 'jwt-from-env';
    (globalThis as typeof globalThis & Record<symbol, { get: () => unknown }>)[
      REQUEST_CONTEXT_SYMBOL
    ] = {
      get: () => ({
        headers: {
          'x-vercel-oidc-token': 'jwt-from-request-context',
        },
      }),
    };

    expect(getVercelOidcToken()).toBe('jwt-from-request-context');
  });

  it('getVercelOidcToken returns undefined for a blank request context header', () => {
    // @vercel/oidc selects the header over the env var as long as the header
    // key is present, so a blank header resolves to undefined here (it does
    // not fall back to VERCEL_OIDC_TOKEN).
    process.env.VERCEL_OIDC_TOKEN = 'jwt-from-env';
    (globalThis as typeof globalThis & Record<symbol, { get: () => unknown }>)[
      REQUEST_CONTEXT_SYMBOL
    ] = {
      get: () => ({
        headers: {
          'x-vercel-oidc-token': '   ',
        },
      }),
    };

    expect(getVercelOidcToken()).toBeUndefined();
  });
});
