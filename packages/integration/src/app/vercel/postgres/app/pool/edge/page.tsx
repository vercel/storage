import { queryUsers } from "@/lib/db-default-pool";

export const runtime = 'edge';

export default async function Page(): Promise<JSX.Element> {
  const users = await queryUsers();
  return (<pre>{JSON.stringify(users, null, 2)}</pre>)
}