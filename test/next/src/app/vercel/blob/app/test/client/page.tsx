'use client';
import { type PutBlobResult } from '@vercel/blob';
import { upload } from '@vercel/blob/client';
import { useEffect, useState, use } from 'react';

export default function AppBodyClient(props: {
  searchParams: Promise<{
    filename: string;
    callback: string;
    multipart: string;
  }>;
}): React.JSX.Element {
  const searchParams = use(props.searchParams);
  const { filename, callback, multipart } = searchParams;
  const [content, setContent] = useState<string>('');
  const [blob, setBlob] = useState<PutBlobResult | null>(null);

  useEffect(() => {
    const doUpload = async (): Promise<void> => {
      const blobResult = await upload(filename, `Hello from ${filename}`, {
        access: 'public',
        handleUploadUrl: callback,
        multipart: multipart === '1',
      });
      setBlob(blobResult);
      setContent(await fetch(blobResult.url).then((r) => r.text()));
    };
    void doUpload();
  }, [filename, callback, multipart]);
  if (!blob || !content) return <div>Loading...</div>;
  return (
    <>
      <h1 className="text-xl mb-4">
        App Router direct string upload example via a Client {callback}
      </h1>
      <p id="blob-path">{blob.pathname}</p>
      <p id="blob-content">{content}</p>
    </>
  );
}
