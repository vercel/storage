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

  // Assert that all methods return the same result.
  if (JSON.stringify(fromPoolClient) !== JSON.stringify(fromSql)) {
    throw new Error(
      `fromPoolClient !== fromSql: ${JSON.stringify(
        fromPoolClient,
      )} !== ${JSON.stringify(fromSql)}`,
    );
  }
  if (JSON.stringify(fromPoolClient) !== JSON.stringify(fromQuery)) {
    throw new Error(
      `fromPoolClient !== fromQuery: ${JSON.stringify(
        fromPoolClient,
      )} !== ${JSON.stringify(fromQuery)}`,
    );
  }

  return fromPoolClient;
};
