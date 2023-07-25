import type {
  DatabaseConnection,
  Dialect,
  DialectAdapter,
  DialectAdapterBase,
  Driver,
  MigrationLockOptions,
} from 'kysely';
import {
  PostgresDialect,
  PostgresDriver,
  Kysely,
  PostgresAdapter,
  sql,
} from 'kysely';
import type { Pool } from '@neondatabase/serverless';
import { createPool } from '@vercel/postgres';
import type { VercelPostgresPoolConfig } from '@vercel/postgres';
import { VercelPostgresKyselyError } from './error';

// Random id for our transaction lock.
const LOCK_ID = BigInt('3853314791062309107');

type VercelPostgresDialectConfig = VercelPostgresPoolConfig & {
  pool: Pool;
};

class VercelPostgresAdapter
  extends PostgresAdapter
  implements DialectAdapterBase
{
  get supportsTransactionalDdl(): boolean {
    return false;
  }

  async acquireMigrationLock(
    db: Kysely<any>,
    _opt: MigrationLockOptions,
  ): Promise<void> {
    await sql`select pg_advisory_lock(${sql.lit(LOCK_ID)})`.execute(db);
  }

  async releaseMigrationLock(
    db: Kysely<any>,
    _opt: MigrationLockOptions,
  ): Promise<void> {
    await sql`select pg_advisory_unlock(${sql.lit(LOCK_ID)})`.execute(db);
  }
}

class VercelPostgresDialect extends PostgresDialect implements Dialect {
  constructor(private config: VercelPostgresDialectConfig) {
    super(config);
  }

  createAdapter(): DialectAdapter {
    return new VercelPostgresAdapter();
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
