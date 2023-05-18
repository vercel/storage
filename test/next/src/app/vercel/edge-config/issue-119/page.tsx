import { get } from '@vercel/edge-config';

export default async function Home(): Promise<JSX.Element> {
  const ids = await get<string[]>('issue119ids');

  return (
    <div>
      This is my server component.
      <br />
      Edge Config: {ids?.toString()}
    </div>
  );
}
