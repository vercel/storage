import type { QueryResultRow } from '@neondatabase/serverless';
import { Client } from '@neondatabase/serverless';
import type { VercelPostgresClientConfig } from './types';
import {
  isDirectConnectionString,
  postgresConnectionString,
} from './postgres-connection-string';
import { VercelPostgresError } from './error';
import type { Primitive } from './sql-template';
import { SqlTemplate } from './sql-template';

export class VercelClient extends Client {
  /**
   * A template literal tag providing safe, easy to use SQL parameterization.
   * Parameters are substituted using the underlying Postgres database, and so must follow
   * the rules of Postgres parameterization.
   * @example
   * ```ts
   * const pool = createClient();
   * const userId = 123;
   * await client.connect();
   * const result = await pool.sql`SELECT * FROM users WHERE id = ${userId}`.execute();
   * // Equivalent to: await pool.query('SELECT * FROM users WHERE id = $1', [id]);
   * await client.end();
   * ```
   * @returns A promise that resolves to the query result.
   */
  sql<O extends QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ): SqlTemplate<O> {
    const template = new SqlTemplate<O>(this.query.bind(this));
    template.append(strings, ...values);
    return template;
  }
}

export function createClient(
  config?: VercelPostgresClientConfig,
): VercelClient {
  const connectionString =
    config?.connectionString ?? postgresConnectionString('direct');
  if (!connectionString)
    throw new VercelPostgresError(
      'missing_connection_string',
      "You did not supply a 'connectionString' and no 'POSTGRES_URL_NON_POOLING' env var was found.",
    );
  if (!isDirectConnectionString(connectionString))
    throw new VercelPostgresError(
      'invalid_connection_string',
      'This connection string is meant to be used with a pooled connection. Try `createPool()` instead.',
    );
  return new VercelClient({
    ...config,
    connectionString,
  });
}
