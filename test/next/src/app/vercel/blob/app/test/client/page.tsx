'use client';
import {
  put,
  type BlobResult,
  type GenerateClientTokenOptions,
} from '@vercel/blob';
import { useEffect, useState } from 'react';

export default function AppBodyClient({
  searchParams,
}: {
  searchParams: { filename: string };
}): JSX.Element {
  const filename = searchParams.filename;
  const [content, setContent] = useState<string>('');
  const [blob, setBlob] = useState<BlobResult | null>(null);

  useEffect(() => {
    const doUpload = async (): Promise<void> => {
      const clientTokenData = (await fetch(
        '/vercel/blob/api/app/upload-token',
        {
          method: 'POST',
          body: JSON.stringify({
            pathname: filename,
            onUploadCompleted: {
              callbackUrl: '/api/upload-completed',
            },
          } as GenerateClientTokenOptions),
        },
      ).then((r) => r.json())) as { clientToken: string };

      const blobResult = await put(filename, `Hello from ${filename}`, {
        access: 'public',
        token: clientTokenData.clientToken,
      });
      setBlob(blobResult);
      setContent(await fetch(blobResult.url).then((r) => r.text()));
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    doUpload();
  }, [filename]);
  if (!blob || !content) return <div>Loading...</div>;
  return (
    <>
      <h1>App Router direct string upload example via a Client</h1>
      <p id="blob-path">{blob.pathname}</p>
      <p id="blob-content">{content}</p>
    </>
  );
}
