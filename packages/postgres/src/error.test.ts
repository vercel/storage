import { VercelPostgresError } from './error';

describe('vercelPostgresError', () => {
  const name = 'VercelPostgresError';
  const msg = 'this is a message';
  const code = 'invalid_connection_string';
  const err = new VercelPostgresError(code, msg);

  it('correctly formats message', () => {
    expect(err.message).toEqual(`${name} - '${code}': ${msg}`);
  });
  it('set name', () => {
    expect(err.name).toEqual(name);
  });
  it('sets code', () => {
    expect(err.code).toEqual(code);
  });
});
