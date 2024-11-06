/* eslint-disable -- I gave up making TS and ESLint happy here for now */

'use client';

import { type PutBlobResult } from '@vercel/blob';
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AppClientUpload(): JSX.Element {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  const [progressEvents, setProgressEvents] = useState<string[]>([]);
  const searchParams = useSearchParams();

  return (
    <>
      <h1 className="text-xl mb-4">App Router Client Upload</h1>

      <form
        onSubmit={async (event): Promise<void> => {
          event.preventDefault();

          const file = inputFileRef.current?.files?.[0];
          if (!file) {
            return;
          }

          setProgressEvents([]); // Clear previous events

          try {
            const blobResult = await upload(file.name, file, {
              access: 'public',
              multipart: searchParams?.get('multipart') === '1',
              handleUploadUrl: `/vercel/blob/api/app/handle-blob-upload/serverless`,
              onUploadProgress(progressEvent) {
                setProgressEvents((prev) => [
                  ...prev,
                  JSON.stringify(progressEvent),
                ]);
              },
            });
            setBlob(blobResult);
          } catch (error) {
            console.error(error);
          }
        }}
      >
        <input
          data-testid="file-input"
          name="file"
          ref={inputFileRef}
          type="file"
        />
        <button
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center"
          data-testid="upload-button"
          type="submit"
        >
          Upload
        </button>
      </form>

      {progressEvents.length > 0 && (
        <div className="mt-4" data-testid="progress-events">
          <h2 className="text-lg font-semibold mb-2">
            Upload Progress Events:
          </h2>
          <ul className="list-disc pl-5">
            {progressEvents.map((event, index) => (
              <li data-testid="progress-event-item" key={index}>
                {event}
              </li>
            ))}
          </ul>
        </div>
      )}

      {blob ? (
        <div className="mt-4" data-testid="blob-result">
          <p>
            Blob url:{' '}
            <a
              className="text-blue-500 hover:underline"
              data-testid="blob-url"
              href={blob.url}
            >
              {blob.url}
            </a>
          </p>
          {blob.url.endsWith('.mp4') ? (
            <video className="mt-2" controls data-testid="video-player">
              <source src={blob.url} type="video/mp4" />
            </video>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
