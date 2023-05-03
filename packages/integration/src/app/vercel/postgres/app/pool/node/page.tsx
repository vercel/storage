import { queryUsers } from '@/lib/postgres-pool';

export const runtime = 'nodejs';

export default async function Page(): Promise<JSX.Element> {
  const users = await queryUsers();
  return <pre>{JSON.stringify(users.rows, null, 2)}</pre>;
}
