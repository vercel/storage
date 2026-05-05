import { getVercelOidcToken } from './vercel-oidc-token';

describe('vercel-oidc-token', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.VERCEL_OIDC_TOKEN;
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
});
