import type { QueryResult, QueryResultRow } from '@neondatabase/serverless';
import { type VercelPool, createPool } from './create-pool';
import type { Primitive } from './sql-template';

export * from './create-client';
export * from './create-pool';
export * from './types';
export { postgresConnectionString } from './postgres-connection-string';

let pool: VercelPool | undefined;

// for future peons who aren't briliant like Malte, this means
// "make an object that will pretend to be a pool but not initialize itself
// until someone tries to access a property on it"
// this also makes it callable, so you can call `sql` as a function
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const val = Reflect.get(pool, prop);
      if (typeof val === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        return val.bind(pool);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return val;
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
) as unknown as VercelPool &
  (<O extends QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<QueryResult<O>>);

export const db = sql;
