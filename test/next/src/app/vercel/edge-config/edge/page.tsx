import { get } from '@vercel/edge-config';

export const runtime = 'edge';

export default async function Page(): Promise<JSX.Element> {
  const ids = await get('issue119ids');
  return <div>{ids?.toString()}</div>;
}
