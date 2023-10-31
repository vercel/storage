import {
  MOCKED_POOLED_CONNECTION_STRING,
  MOCKED_DIRECT_CONNECTION_STRING,
} from './mocks';
import {
  isDirectConnectionString,
  isLocalhostConnectionString,
  isPooledConnectionString,
  postgresConnectionString,
} from './postgres-connection-string';

describe('postgresConnectionString', () => {
  beforeEach(() => {
    process.env.POSTGRES_URL = undefined;
    process.env.POSTGRES_URL_NON_POOLING = undefined;
  });

  afterEach(() => {
    process.env.POSTGRES_URL = undefined;
    process.env.POSTGRES_URL_NON_POOLING = undefined;
  });

  it(`returns 'POSTGRES_URL' for 'pool'`, () => {
    const envVar = 'foobar';
    process.env.POSTGRES_URL = envVar;
    expect(postgresConnectionString('pool')).toEqual(envVar);
  });

  it(`returns undefined for 'pool' when no env var is present`, () => {
    expect(postgresConnectionString('pool')).toEqual(undefined);
  });

  it(`returns 'POSTGRES_URL_NON_POOLING' for 'direct'`, () => {
    const envVar = 'barfoo';
    process.env.POSTGRES_URL_NON_POOLING = envVar;
    expect(postgresConnectionString('direct')).toEqual(envVar);
  });

  it(`returns undefined for 'direct' when no env var is present`, () => {
    expect(postgresConnectionString('direct')).toEqual(undefined);
  });

  it(`returns 'POSTGRES_URL' and 'POSTGRES_URL_NON_POOLING' for both`, () => {
    const poolVar = 'this-is-a-pool';
    const directVar = 'this-is-a-direct';
    process.env.POSTGRES_URL = poolVar;
    process.env.POSTGRES_URL_NON_POOLING = directVar;
    expect(postgresConnectionString('direct')).toEqual(directVar);
    expect(postgresConnectionString('pool')).toEqual(poolVar);
  });

  it(`returns undefined for both when no env var`, () => {
    expect(postgresConnectionString('direct')).toEqual(undefined);
    expect(postgresConnectionString('pool')).toEqual(undefined);
  });
});

describe('isDirectConnectionString', () => {
  it('returns true for a valid direct connection string', () => {
    expect(isDirectConnectionString(MOCKED_DIRECT_CONNECTION_STRING)).toEqual(
      true,
    );
  });
  it('returns false for a pooled connection string', () => {
    expect(isDirectConnectionString(MOCKED_POOLED_CONNECTION_STRING)).toEqual(
      false,
    );
  });
});

describe('isPooledConnectionString', () => {
  it('returns true for a valid pooled connection string', () => {
    expect(isPooledConnectionString(MOCKED_POOLED_CONNECTION_STRING)).toEqual(
      true,
    );
  });
  it('returns false for a direct connection string', () => {
    expect(isPooledConnectionString(MOCKED_DIRECT_CONNECTION_STRING)).toEqual(
      false,
    );
  });
});

describe('isLocalhostConnectionString', () => {
  it.each(['localhost', 'http', 'foobar', 'blah'])(
    'returns false for invalid connection strings: %s',
    (connectionString) => {
      expect(isLocalhostConnectionString(connectionString)).toEqual(false);
    },
  );
  it.each([
    'postgresql://localhost',
    'postgresql://localhost:5432',
    'postgresql://localhost/mydb',
    'postgresql://user@localhost',
    'postgresql://user:secret@localhost',
    'postgresql://other@localhost/otherdb?connect_timeout=10&application_name=myapp',
    'postgresql://localhost/mydb?user=other&password=secret',
  ])(
    'returns true for a valid localhost connection string',
    (connectionString) => {
      expect(isLocalhostConnectionString(connectionString)).toEqual(true);
    },
  );
  it('returns false for a valid non-localhost connection string', () => {
    expect(
      isLocalhostConnectionString(MOCKED_POOLED_CONNECTION_STRING),
    ).toEqual(false);
  });
});
