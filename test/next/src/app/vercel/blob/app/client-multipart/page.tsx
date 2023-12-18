'use client';

import { type PutBlobResult } from '@vercel/blob';
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';

export default function AppClientUpload(): JSX.Element {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  return (
    <>
      <h1 className="text-xl mb-4">App Router Client Upload (multipart)</h1>

      <form
        onSubmit={async (event): Promise<void> => {
          event.preventDefault();

          const file = inputFileRef.current?.files?.[0];
          if (!file) {
            return;
          }

          try {
            const blobResult = await upload(file.name, file, {
              access: 'public',
              handleUploadUrl: `/vercel/blob/api/app/handle-blob-upload/edge`,
              multipart: true,
            });

            setBlob(blobResult);
          } catch (error: unknown) {
            // eslint-disable-next-line no-console -- Fine for tests
            console.log('error', error);
          }
        }}
      >
        <input name="file" ref={inputFileRef} type="file" />
        <button
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center"
          type="submit"
        >
          Upload
        </button>
      </form>
      {blob ? (
        <div>
          Blob url: <a href={blob.url}>{blob.url}</a>
          {blob.url.endsWith('.mp4') ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- no caption for tests, this is fine
            <video controls>
              <source src={blob.url} type="video/mp4" />
            </video>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
