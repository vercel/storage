import type { QueryResult } from '@vercel/postgres';
import { sql } from '@vercel/postgres';

export const queryUsers = async (): Promise<QueryResult> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    // eslint-disable-next-line no-promise-executor-return
    setTimeout(
      () => reject(new Error('SELECT hung for more than 20 seconds')),
      20000,
    ),
  );
  const client = await sql.connect();
  const usersPromise = client.sql`SELECT * FROM users`;
  try {
    return await Promise.race([timeoutPromise, usersPromise]);
  } finally {
    client.release();
  }
};
