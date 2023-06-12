import {
  MOCKED_CLIENT_RESPONSE,
  MOCKED_POOLED_CONNECTION_STRING,
  MOCKED_POOL_RESPONSE,
} from './mocks';
import { createKysely } from '.';

jest.mock('@vercel/postgres', () => {
  return {
    createPool: jest.fn().mockImplementation(() => {
      return {
        query: jest.fn().mockImplementation(() => ({
          rows: [MOCKED_POOL_RESPONSE],
        })),
        end: jest.fn(),
        // the pg driver uses the result of `connect` in a `WeakMap`, so we need an object to return
        connect: jest.fn(() => {
          return {
            query: jest.fn(() => ({
              command: 'SELECT',
              rows: [MOCKED_POOL_RESPONSE],
            })),
            release: jest.fn(),
          };
        }),
      };
    }),
    Client: jest.fn().mockImplementation(() => {
      return {
        query: jest
          .fn()
          .mockImplementation(() => ({ rows: [MOCKED_CLIENT_RESPONSE] })),
        end: jest.fn(),
        connect: jest.fn(() => {
          return {};
        }),
      };
    }),
  };
});

interface DB {
  user: {
    first_name: string;
  };
}

describe('kysely', () => {
  beforeEach(() => {
    process.env.POSTGRES_URL = undefined;
    process.env.POSTGRES_URL_NON_POOLING = undefined;
  });
  afterAll(() => {
    jest.resetAllMocks();
  });
  describe('createKysely', () => {
    it('creates a pool with env', async () => {
      process.env.POSTGRES_URL = MOCKED_POOLED_CONNECTION_STRING;
      const db = createKysely<DB>();
      const res = await db
        .selectFrom('user')
        .select('first_name')
        .executeTakeFirst();
      expect(res).toEqual(MOCKED_POOL_RESPONSE);
    });
    it('creates a pool with config', async () => {
      const db = createKysely<DB>({
        connectionString: MOCKED_POOLED_CONNECTION_STRING,
      });
      const res = await db
        .selectFrom('user')
        .select('first_name')
        .executeTakeFirst();
      expect(res).toEqual(MOCKED_POOL_RESPONSE);
    });
  });
});
