'use client';

import type { BlobResult } from '@vercel/blob';
import { useState } from 'react';

// eslint-disable-next-line import/no-default-export
export default function FormDataUpload({
  action,
}: {
  action: string;
}): JSX.Element {
  const [blob, setBlob] = useState<BlobResult | null>(null);

  return (
    <>
      <form
        action={action}
        encType="multipart/form-data"
        method="POST"
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={async (event): Promise<void> => {
          event.preventDefault();

          const formData = new FormData(event.currentTarget);
          const response = await fetch(action, {
            method: 'POST',
            body: formData,
          });
          const blobResult = (await response.json()) as BlobResult;
          setBlob(blobResult);
        }}
      >
        <input name="file" type="file" />
        <button type="submit">Upload</button>
      </form>
      {blob ? (
        <div>
          <hr />
          Blob url: <a href={blob.url}>{blob.url}</a>
          {blob.url.endsWith('.mp4') ? (
            <div>
              <hr />
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video autoPlay controls>
                <source src={blob.url} type="video/mp4" />
              </video>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
