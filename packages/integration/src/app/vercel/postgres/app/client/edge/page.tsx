import { queryUsers } from '@/lib/postgres-client';

export const runtime = 'edge';

export default async function Page(): Promise<JSX.Element> {
  const users = await queryUsers();
  return <pre>{JSON.stringify(users.rows, null, 2)}</pre>;
}
