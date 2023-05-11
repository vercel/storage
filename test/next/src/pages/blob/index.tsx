import type { GetServerSideProps } from 'next';
import * as vercelBlob from '@vercel/blob';

export const getServerSideProps: GetServerSideProps = async () => {
  const blob = await vercelBlob.put('test-page.txt', 'Hello from Pages', {
    access: 'public',
  });

  return {
    props: {
      ...blob,
      uploadedAt: blob.uploadedAt.toString(),
    },
  };
};

export default function Blob(props: vercelBlob.BlobResult): JSX.Element {
  return (
    <div>
      <h1>blob</h1>

      <p id="blob-path">{props.pathname}</p>
    </div>
  );
}
