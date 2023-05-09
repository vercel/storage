import type { Pool } from './types';
import {
  MOCKED_DIRECT_CONNECTION_STRING,
  MOCKED_LOCALHOST_CONNECTION_STRING,
  MOCKED_POOLED_CONNECTION_STRING,
} from './mocks';
import { createPool } from './create-pool';
import { VercelPostgresError } from './error';

jest.mock('@neondatabase/serverless', () => {
  return {
    Client: jest
      .fn()
      .mockImplementation((config: { connectionString: string }) => {
        return {
          query: jest.fn().mockImplementation(() => config.connectionString),
        };
      }),
    Pool: jest
      .fn()
      .mockImplementation((config: { connectionString: string }) => {
        return {
          query: jest.fn().mockImplementation(() => config.connectionString),
        };
      }),
  };
});

describe('createPool', () => {
  beforeEach(() => {
    process.env.POSTGRES_URL = undefined;
  });

  afterEach(() => {
    process.env.POSTGRES_URL = undefined;
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  it('creates a pool with config', async () => {
    const pool = createPool({
      connectionString: MOCKED_POOLED_CONNECTION_STRING,
    });
    expect(await pool.query('SELECT now()')).toEqual(
      MOCKED_POOLED_CONNECTION_STRING,
    );
  });

  it('creates a pool with POSTGRES_URL', async () => {
    process.env.POSTGRES_URL = MOCKED_POOLED_CONNECTION_STRING;
    const pool = createPool();
    expect(await pool.query('SELECT now()')).toEqual(
      MOCKED_POOLED_CONNECTION_STRING,
    );
  });

  it('if both config and env var are present, uses config', async () => {
    process.env.POSTGRES_URL = MOCKED_DIRECT_CONNECTION_STRING;
    const pool = createPool({
      connectionString: MOCKED_POOLED_CONNECTION_STRING,
    });
    expect(await pool.query('SELECT now()')).toEqual(
      MOCKED_POOLED_CONNECTION_STRING,
    );
  });

  it('throws `VercelPostgresError` if no env var or connection string', () => {
    process.env.POSTGRES_URL_NON_POOLING = undefined;
    process.env.POSTGRES_URL = undefined;
    expect(createPool).toThrow(VercelPostgresError);
    expect(createPool).toThrow('missing_connection_string');
  });

  it('throws error if provided with direct connection string', () => {
    const bad = (): Pool =>
      createPool({ connectionString: MOCKED_DIRECT_CONNECTION_STRING });
    expect(bad).toThrow(VercelPostgresError);
    expect(bad).toThrow('invalid_connection_string');
  });

  it('does not throw error if provided with local connection string', () => {
    const good = (): Pool =>
      createPool({ connectionString: MOCKED_LOCALHOST_CONNECTION_STRING });
    expect(good).not.toThrow(VercelPostgresError);
  });
});
