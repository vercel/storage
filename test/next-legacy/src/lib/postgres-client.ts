import type { QueryResult } from '@vercel/postgres';
import { createClient } from '@vercel/postgres';

export const queryUsers = async (): Promise<QueryResult> => {
  const db = createClient();
  await db.connect();
  const timeoutPromise = new Promise<never>((_, reject) =>
    // eslint-disable-next-line no-promise-executor-return -- [@vercel/style-guide@5 migration]
    setTimeout(() => {
      reject(new Error('SELECT hung for more than 20 seconds'));
    }, 20000),
  );
  const usersPromise = db.query('SELECT * FROM users');
  try {
    return await Promise.race([timeoutPromise, usersPromise]);
  } finally {
    await db.end();
  }
};
