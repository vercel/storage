import type { DatabaseConnection, Dialect, Driver } from 'kysely';
import { PostgresDialect, PostgresDriver, Kysely } from 'kysely';
import type { Pool } from '@neondatabase/serverless';
import { createPool } from '@vercel/postgres';
import type { VercelPostgresPoolConfig } from '@vercel/postgres';
import { VercelPostgresKyselyError } from './error';

type VercelPostgresDialectConfig = VercelPostgresPoolConfig & {
  pool: Pool;
};

class VercelPostgresDialect extends PostgresDialect implements Dialect {
  constructor(private config: VercelPostgresDialectConfig) {
    super(config);
  }

  createDriver(): Driver {
    return new VercelPostgresPoolDriver(this.config);
  }
}

class VercelPostgresPoolDriver extends PostgresDriver {
  // Rather than trying to rebuild a perfectly good connection pool,
  // we can just use a proxy to throw if the user tries to stream.
  async acquireConnection(): Promise<DatabaseConnection> {
    const connection = await super.acquireConnection();
    return new Proxy(connection, {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      get(target, p) {
        const original = target[p as keyof DatabaseConnection];
        if (p === 'streamQuery' && typeof original === 'function') {
          throw new VercelPostgresKyselyError(
            'kysely_streaming_not_supported',
            'Streaming is not supported yet.',
          );
        }
        if (typeof original === 'function') {
          return original.bind(target);
        }
        return original;
      },
    });
  }

  beginTransaction(): Promise<void> {
    throw new VercelPostgresKyselyError(
      'kysely_transactions_not_supported',
      'Transactions are not supported yet.',
    );
  }

  commitTransaction(): Promise<void> {
    throw new VercelPostgresKyselyError(
      'kysely_transactions_not_supported',
      'Transactions are not supported yet.',
    );
  }

  rollbackTransaction(): Promise<void> {
    throw new VercelPostgresKyselyError(
      'kysely_transactions_not_supported',
      'Transactions are not supported yet.',
    );
  }
}

export function createKysely<T>(config?: VercelPostgresPoolConfig): Kysely<T> {
  return new Kysely<T>({
    dialect: new VercelPostgresDialect({
      ...config,
      pool: createPool(config),
    }),
  });
}
