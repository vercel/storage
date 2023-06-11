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

  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'rows');
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'rowCount');
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'command');
  assertFieldEqual(fromPoolClient, fromSql, fromQuery, 'fields');

  return fromPoolClient;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertFieldEqual(a: any, b: any, c: any, field: string): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `${field} a/b: ${JSON.stringify(a[field])} !== ${JSON.stringify(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        b[field],
      )}`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (JSON.stringify(a[field]) !== JSON.stringify(c[field])) {
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `${field} a/c: ${JSON.stringify(a[field])} !== ${JSON.stringify(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        c[field],
      )}`,
    );
  }
}
