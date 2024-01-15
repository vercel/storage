import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GetServerSideProps } from 'next';
import * as vercelBlob from '@vercel/blob';

export const getServerSideProps: GetServerSideProps = async (req) => {
  const prefix = req.query.prefix as string;
  const imgPath = path.join(process.cwd(), 'images');
  const imageFile = fs.readFileSync(path.join(imgPath, `g.jpeg`));

  const blob = await vercelBlob.put(`${prefix}/g.jpeg`, imageFile, {
    access: 'public',
  });

  return {
    props: {
      ...blob,
    },
  };
};

export default function Blob(props: vercelBlob.PutBlobResult): JSX.Element {
  return (
    <div>
      <h1 className="text-xl mb-4">Render an upload image on the browser</h1>

      {/* eslint-disable-next-line @next/next/no-img-element -- we want an image element here, fine */}
      <img alt="test" src={props.url} />
    </div>
  );
}
