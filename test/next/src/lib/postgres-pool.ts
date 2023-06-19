/* eslint-disable @typescript-eslint/restrict-template-expressions */
import type { QueryResult } from '@vercel/postgres';
import { sql } from '@vercel/postgres';
import { sortBy } from 'lodash';
import deepEqual from 'deep-equal';

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
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'fields', 'name');

  return fromPoolClient;
};

function assertFieldEqual(
  a: never,
  b: never,
  c: never,
  field: string,
  sortProperty?: string,
): void {
  const aToCompare = sortProperty ? sortBy(a[field], sortProperty) : a[field];
  const bToCompare = sortProperty ? sortBy(b[field], sortProperty) : b[field];
  const cTompare = sortProperty ? sortBy(b[field], sortProperty) : c[field];

  if (!deepEqual(aToCompare, bToCompare)) {
    throw new Error(`${field} a/b: ${aToCompare} !== ${bToCompare}`);
  }

  if (!deepEqual(aToCompare, cTompare)) {
    throw new Error(`${field} a/c: ${aToCompare} !== ${cTompare}`);
  }
}
