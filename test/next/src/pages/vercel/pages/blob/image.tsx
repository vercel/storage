import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GetServerSideProps } from 'next';
import * as vercelBlob from '@vercel/blob';

export const getServerSideProps: GetServerSideProps = async () => {
  const imgPath = path.join(process.cwd(), 'images');
  const imageFile = fs.readFileSync(
    path.join(imgPath, `checkly-scheduled-blob.jpeg`),
  );

  const blob = await vercelBlob.put('checkly-scheduled-blob.jpeg', imageFile, {
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

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="test" src={props.url} />
    </div>
  );
}
