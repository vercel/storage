import * as vercelBlob from '@vercel/blob';

export default async function AppBodyServerless(props: {
  searchParams: Promise<{ filename: string }>;
}): Promise<React.JSX.Element> {
  const searchParams = await props.searchParams;
  const filename = searchParams.filename;
  const blob = await vercelBlob.put(filename, `Hello from ${filename}`, {
    access: 'public',
  });
  const content = await fetch(blob.url).then((r) => r.text());
  return (
    <>
      <h1 className="text-xl mb-4">
        App Router direct string upload example via a Serverless Function
      </h1>
      <p id="blob-path">{blob.pathname}</p>
      <p id="blob-content">{content}</p>
    </>
  );
}
