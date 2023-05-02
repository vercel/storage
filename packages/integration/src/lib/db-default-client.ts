import { createClient } from '@vercel/postgres';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const queryUsers = async (): Promise<any> => {
  const db = createClient();
  await db.connect();
  const timeoutPromise = new Promise((_, reject) =>
    // eslint-disable-next-line no-promise-executor-return
    setTimeout(
      () => reject(new Error('SELECT hung for more than 20 seconds')),
      20000,
    ),
  );
  const usersPromise = db.query('SELECT * FROM users');
  try {
    return await Promise.race([timeoutPromise, usersPromise]);
  } finally {
    await db.end();
  }
};
