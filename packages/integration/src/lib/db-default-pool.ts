import { sql } from '@vercel/postgres';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const queryUsers = async (): Promise<any> => {
  const timeoutPromise = new Promise((_, reject) =>
    // eslint-disable-next-line no-promise-executor-return
    setTimeout(
      () => reject(new Error('SELECT hung for more than 20 seconds')),
      20000,
    ),
  );
  // const usersPromise = sql`SELECT * FROM users`;
  const client = await sql.connect();
  const usersPromise = client.sql`SELECT * FROM users`;
  try {
    return await Promise.race([timeoutPromise, usersPromise]);
  } finally {
    client.release();
  }
};
