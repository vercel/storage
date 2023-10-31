import type { QueryResult, QueryResultRow } from '@neondatabase/serverless';
import { Client } from '@neondatabase/serverless';
import type { VercelPostgresClientConfig } from './types';
import {
  isDirectConnectionString,
  isLocalhostConnectionString,
  postgresConnectionString,
} from './postgres-connection-string';
import { VercelPostgresError } from './error';
import type { Primitive } from './sql-template';
import { sqlTemplate } from './sql-template';

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
   * const result = await pool.sql`SELECT * FROM users WHERE id = ${userId}`;
   * // Equivalent to: await pool.query('SELECT * FROM users WHERE id = $1', [id]);
   * await client.end();
   * ```
   * @returns A promise that resolves to the query result.
   */
  async sql<O extends QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ): Promise<QueryResult<O>> {
    const [query, params] = sqlTemplate(strings, ...values);
    return this.query(query, params);
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
  if (
    !isLocalhostConnectionString(connectionString) &&
    !isDirectConnectionString(connectionString)
  )
    throw new VercelPostgresError(
      'invalid_connection_string',
      'This connection string is meant to be used with a pooled connection. Try `createPool()` instead.',
    );
  return new VercelClient({
    ...config,
    connectionString,
  });
}
