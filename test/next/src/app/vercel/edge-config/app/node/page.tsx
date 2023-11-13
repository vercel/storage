import { get } from '@vercel/edge-config';

export const runtime = 'nodejs';

export default async function Page(): Promise<JSX.Element> {
  const value = await get('keyForTest');

  if (value !== 'valueForTest')
    throw new Error(
      "Expected Edge Config Item 'keyForTest' to have value 'valueForTest'",
    );

  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
