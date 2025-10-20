import { get } from '@vercel/edge-config';

export const runtime = 'edge';

export default async function Page(): Promise<React.JSX.Element> {
  const value = await get('keyForTest');

  if (value !== 'valueForTest')
    throw new Error(
      "Expected Edge Config Item 'keyForTest' to have value 'valueForTest'",
    );

  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
