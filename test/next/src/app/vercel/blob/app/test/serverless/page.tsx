import * as vercelBlob from '@vercel/blob';

export default async function AppBodyEdge(): Promise<JSX.Element> {
  const blob = await vercelBlob.put(
    'test-app-serverless.txt',
    'Hello from Pages',
    {
      access: 'public',
    },
  );
  return (
    <>
      <h1>App Router direct string upload example via a Serverless Function</h1>
      <p id="blob-path">{blob.pathname}</p>
    </>
  );
}
