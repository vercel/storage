import type { NextApiRequest, NextApiResponse } from 'next';
import { queryUsers } from '@/lib/postgres-kysely';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(
  _: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  try {
    const users = await queryUsers();
    res.status(200).json(users);
  } catch (e) {
    res.status(500).json({ message: (e as Error).message });
  }
}
