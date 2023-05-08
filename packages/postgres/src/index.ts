import type { QueryResultRow } from '@neondatabase/serverless';
import { type VercelPool, createPool } from './create-pool';
import type { Primitive, SqlTemplate } from './sql-template';

export * from './create-client';
export * from './create-pool';
export * from './types';
export { postgresConnectionString } from './postgres-connection-string';

let pool: VercelPool | undefined;

type DefaultPoolExport = VercelPool &
  (<O extends QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => SqlTemplate<O>);

// for future peons who aren't briliant like Malte, this means
// "make an object that will pretend to be a pool but not initialize itself
// until someone tries to access a property on it"
// this also makes it callable, so you can call `sql` as a function
/**
 * A template literal tag providing safe, easy to use SQL parameterization.
 * Almost the same as a pool created via {@link createPool}, but with the ability to be called
 * as a function for convenient one-off querying.
 *
 * @example
 * For a one-off query:
 * ```ts
 * const userId = 123;
 * const result = await sql`SELECT * FROM users WHERE id = ${userId}`.execute();
 * // Equivalent to: await pool.query('SELECT * FROM users WHERE id = $1', [id]);
 * ```
 *
 * @example
 * For multiple queries during the same request, or to use a transaction:
 * ```ts
 * const client = await sql.connect();
 * const { rows } = await client.sql`SELECT * FROM users WHERE id = ${userId};`.execute();
 * await client.sql`UPDATE users SET status = 'satisfied' WHERE id = ${userId};`.execute();
 * client.release();
 * ```
 *
 * @example
 * To unsafely parameterize things that pgsql can't natively parameterize:
 * ```ts
 * // Don't use `appendUnsafeRaw` unless you absolutely know the input to it is safe!
 * const result = await sql`SELECT * FROM `.appendUnsafeRaw('users').append` WHERE id = 1;`.execute();
 * ```
 */
export const sql = new Proxy(
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  () => {},
  {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    get(_, prop) {
      if (!pool) {
        pool = createPool();
      }

      // keep an eye on this -- it'll fail on certain cases, like private property access, which can
      // require weird things like binding or calling with an explicit `this` arg.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Reflect.get(pool, prop);
    },
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    apply(_, __, argumentsList) {
      if (!pool) {
        pool = createPool();
      }

      // @ts-expect-error - we're breaking all kinds of rules
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return pool.sql(...argumentsList);
    },
  },
) as unknown as DefaultPoolExport;

/**
 * A template literal tag providing safe, easy to use SQL parameterization.
 * Almost the same as a pool created via {@link createPool}, but with the ability to be called
 * as a function for convenient one-off querying.
 *
 * @example
 * For a one-off query:
 * ```ts
 * const userId = 123;
 * const result = await sql`SELECT * FROM users WHERE id = ${userId}`.execute();
 * // Equivalent to: await pool.query('SELECT * FROM users WHERE id = $1', [id]);
 * ```
 *
 * @example
 * For multiple queries during the same request, or to use a transaction:
 * ```ts
 * const client = await sql.connect();
 * const { rows } = await client.sql`SELECT * FROM users WHERE id = ${userId};`.execute();
 * await client.sql`UPDATE users SET status = 'satisfied' WHERE id = ${userId};`.execute();
 * client.release();
 * ```
 *
 * @example
 * To unsafely parameterize things that pgsql can't natively parameterize:
 * ```ts
 * // Don't use `appendUnsafeRaw` unless you absolutely know the input to it is safe!
 * const result = await sql`SELECT * FROM `.appendUnsafeRaw('users').append` WHERE id = 1;`.execute();
 * ```
 */
export const db = sql;
