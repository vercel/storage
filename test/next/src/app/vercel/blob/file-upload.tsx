'use client';

import type { PutBlobResult } from '@vercel/blob';
import { useState } from 'react';

// eslint-disable-next-line import/no-default-export
export default function Upload({ action }: { action: string }): JSX.Element {
  const [blob, setBlob] = useState<PutBlobResult | null>(null);

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

          if (!formData.has('file')) {
            // eslint-disable-next-line no-alert
            alert('Please select a file to upload');
            return;
          }

          try {
            const response = await fetch(action, {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error(`Error: ${response.status}`);
            }

            setBlob((await response.json()) as PutBlobResult);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error uploading file:', error);
          }
        }}
      >
        <input name="file" type="file" />
        <button type="submit">Upload</button>
      </form>
      {blob ? <div>{blob.url}</div> : null}
    </>
  );
}
