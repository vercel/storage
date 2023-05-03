import { queryUsers } from '@/lib/postgres-kysely';

export const runtime = 'edge';

export default async function Page(): Promise<JSX.Element> {
  const users = await queryUsers();
  return <pre>{JSON.stringify(users, null, 2)}</pre>;
}
