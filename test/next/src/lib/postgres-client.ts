import type { QueryResult } from '@vercel/postgres';
import { createClient } from '@vercel/postgres';

export const queryUsers = async (): Promise<QueryResult> => {
  const client = createClient();
  await client.connect();
  const timeoutPromise = new Promise<never>((_, reject) =>
    // eslint-disable-next-line no-promise-executor-return
    setTimeout(
      () => reject(new Error('SELECT hung for more than 20 seconds')),
      20000,
    ),
  );
  const usersPromise = client.sql`SELECT * FROM users`.execute();
  try {
    return await Promise.race([timeoutPromise, usersPromise]);
  } finally {
    await client.end();
  }
};
