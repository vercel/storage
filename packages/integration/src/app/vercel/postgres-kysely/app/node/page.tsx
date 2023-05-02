import { queryUsers } from "@/lib/db-kysely-pool";

export const runtime = 'nodejs';

export default async function Page(): Promise<JSX.Element> {
  const users = await queryUsers();
  return (<pre>{JSON.stringify(users, null, 2)}</pre>)
}