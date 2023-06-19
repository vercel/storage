import { dequal as deepEqual } from 'dequal';
import type { QueryResult } from '@vercel/postgres';
import { sql } from '@vercel/postgres';

function timeout(msg: string): Promise<never> {
  return new Promise<never>((_, reject) =>
    // eslint-disable-next-line no-promise-executor-return
    setTimeout(
      () => reject(new Error(`SELECT hung for more than 20 seconds in ${msg}`)),
      20000,
    ),
  );
}

const queryUsersViaPoolClient = async (): Promise<QueryResult> => {
  const timeoutPromise = timeout('pool client ');
  const client = await sql.connect();
  const usersPromise = client.sql`SELECT * FROM users`;
  try {
    return await Promise.race([timeoutPromise, usersPromise]);
  } finally {
    client.release();
  }
};

const queryUsersViaSql = async (): Promise<QueryResult> => {
  const timeoutPromise = timeout('sql');
  const usersPromise = sql`SELECT * FROM users`;
  return Promise.race([timeoutPromise, usersPromise]);
};

const queryUsersViaPoolQuery = async (): Promise<QueryResult> => {
  const timeoutPromise = timeout('pool query');
  const usersPromise = sql.query('SELECT * FROM users');
  return Promise.race([timeoutPromise, usersPromise]);
};

export const queryUsers = async (): Promise<QueryResult> => {
  const fromPoolClient = await queryUsersViaPoolClient();
  const fromSql = await queryUsersViaSql();
  const fromQuery = await queryUsersViaPoolQuery();

  // @ts-expect-error never is not compatible here
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'rows');
  // @ts-expect-error never is not compatible here
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'rowCount');
  // @ts-expect-error never is not compatible here
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'command');
  // @ts-expect-error never is not compatible here
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'fields');

  return fromPoolClient;
};

function assertFieldEqual(a: never, b: never, c: never, field: string): void {
  const aToCompare = JSON.parse(JSON.stringify(a[field])) as never;
  const bToCompare = JSON.parse(JSON.stringify(b[field])) as never;
  const cTompare = JSON.parse(JSON.stringify(c[field])) as never;

  if (!deepEqual(aToCompare, bToCompare)) {
    throw new Error(
      `${field} a/b: ${JSON.stringify(aToCompare)} !== ${JSON.stringify(
        bToCompare,
      )}`,
    );
  }

  if (!deepEqual(aToCompare, cTompare)) {
    throw new Error(
      `${field} a/c: ${JSON.stringify(aToCompare)} !== ${JSON.stringify(
        cTompare,
      )}`,
    );
  }
}
