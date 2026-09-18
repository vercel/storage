import { get } from '@vercel/global-config';

export const runtime = 'edge';

export default async function Page(): Promise<React.JSX.Element> {
  const value = await get('keyForTest');

  if (value !== 'valueForTest')
    throw new Error(
      "Expected Global Config Item 'keyForTest' to have value 'valueForTest'",
    );

  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
