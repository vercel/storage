'use client';

import type { PutBlobResult } from '@vercel/blob';
import { useRef, useState } from 'react';

export function FormBodyUpload({ action }: { action: string }): JSX.Element {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);

  return (
    <>
      <form
        action={action}
        encType="multipart/form-data"
        method="POST"
        onSubmit={async (event): Promise<void> => {
          event.preventDefault();

          const file = inputFileRef.current?.files?.[0];
          const response = await fetch(
            `${action}?filename=${file?.name ?? ''}`,
            {
              method: 'POST',
              body: file,
            },
          );
          const blobResult = (await response.json()) as PutBlobResult;
          setBlob(blobResult);
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
            <video autoPlay controls>
              <source src={blob.url} type="video/mp4" />
            </video>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
