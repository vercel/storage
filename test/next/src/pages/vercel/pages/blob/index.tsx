import type { GetServerSideProps } from 'next';
import * as vercelBlob from '@vercel/blob';

export const getServerSideProps: GetServerSideProps = async (req) => {
  const filename = req.query.filename as string;
  const blob = await vercelBlob.put(filename, `Hello from ${filename}`, {
    access: 'public',
  });
  const content = await fetch(blob.url).then((r) => r.text());

  return {
    props: {
      ...blob,
      content,
    },
  };
};

export default function Blob(
  props: vercelBlob.PutBlobResult & { content: string },
): JSX.Element {
  return (
    <div>
      <h1 className="text-xl mb-4">blob</h1>

      <p id="blob-path">{props.pathname}</p>
      <p id="blob-content">{props.content}</p>
    </div>
  );
}
