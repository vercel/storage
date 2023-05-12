import * as vercelBlob from '@vercel/blob';

export const runtime = 'edge';

export default async function AppBodyEdge(): Promise<JSX.Element> {
  const blob = await vercelBlob.put('test-app-edge.txt', 'Hello from Pages', {
    access: 'public',
  });
  return (
    <>
      <h1>App Router direct string upload example via an Edge Function</h1>
      <p id="blob-path">{blob.pathname}</p>
    </>
  );
}
