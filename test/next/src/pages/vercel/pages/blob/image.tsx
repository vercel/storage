import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vercelBlob from '@vercel/blob';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (req) => {
  const prefix = req.query.prefix as string;
  const imgPath = path.join(process.cwd(), 'images');
  const imageFile = fs.readFileSync(path.join(imgPath, `g.jpeg`));

  const blob = await vercelBlob.put(`${prefix}/g.jpeg`, imageFile, {
    access: 'public',
    addRandomSuffix: true,
  });

  return {
    props: {
      ...blob,
    },
  };
};

export default function Blob(
  props: vercelBlob.PutBlobResult,
): React.JSX.Element {
  return (
    <div>
      <h1 className="text-xl mb-4">Render an upload image on the browser</h1>
      <img alt="test" id="test-screenshot" src={props.url} />
    </div>
  );
}
