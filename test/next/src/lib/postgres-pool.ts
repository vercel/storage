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
  const usersPromise = sql`SELECT * FROM users`.execute();
  return Promise.race([timeoutPromise, usersPromise]);
};
