import type { QueryResult, QueryResultRow } from '@neondatabase/serverless';
import { createPool, type VercelPool } from './create-pool';
import type { Primitive } from './sql-template';

export { types } from '@neondatabase/serverless';
export * from './create-client';
export * from './create-pool';
export { postgresConnectionString } from './postgres-connection-string';
export * from './types';

let pool: VercelPool | undefined;

// for future peons who aren't briliant like Malte, this means
// "make an object that will pretend to be a pool but not initialize itself
// until someone tries to access a property on it"
// this also makes it callable, so you can call `sql` as a function
export const sql = new Proxy(() => {}, {
  get(_, prop) {
    if (!pool) {
      pool = createPool();
    }

    // keep an eye on this -- it'll fail on certain cases, like private property access, which can
    // require weird things like binding or calling with an explicit `this` arg.

    const val = Reflect.get(pool, prop);
    if (typeof val === 'function') {
      return val.bind(pool);
    }

    return val;
  },
  apply(_, __, argumentsList) {
    if (!pool) {
      pool = createPool();
    }

    // @ts-expect-error - we're breaking all kinds of rules

    return pool.sql(...argumentsList);
  },
}) as unknown as VercelPool &
  (<O extends QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<QueryResult<O>>);

export const db = sql;
