'use client';

import type { PutBlobResult } from '@vercel/blob';
import { uploadPresigned } from '@vercel/blob/client';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { API_ROOT } from '../../../api/app/constants';

export default function AppPresignedUpload(): React.JSX.Element {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  const [presignedGetUrl, setPresignedGetUrl] = useState<string | null>(null);
  const [presignedGetError, setPresignedGetError] = useState<string | null>(
    null,
  );
  const [progressEvents, setProgressEvents] = useState<string[]>([]);
  const searchParams = useSearchParams();

  return (
    <>
      <h1 className="text-xl mb-4">
        App Router Client Upload (Presigned Upload)
      </h1>

      <form
        onSubmit={async (event): Promise<void> => {
          event.preventDefault();

          const file = inputFileRef.current?.files?.[0];
          if (!file) {
            return;
          }

          setProgressEvents([]); // Clear previous events
          setPresignedGetUrl(null);
          setPresignedGetError(null);

          try {
            const blobResult = await uploadPresigned(file.name, file, {
              access: 'private',
              multipart: searchParams?.get('multipart') === '1',
              handleUploadUrl: `/vercel/blob/api/app/handle-blob-upload-presigned/serverless`,
              // Example of using the new headers parameter to send an authorization header
              headers: {
                Authorization: 'Bearer your-token-here',
                'X-Custom-Header': 'Custom Value',
              },
              onUploadProgress(progressEvent) {
                setProgressEvents((prev) => [
                  ...prev,
                  JSON.stringify(progressEvent),
                ]);
              },
            });
            setBlob(blobResult);

            try {
              const readRes = await fetch(`${API_ROOT}/presigned-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: blobResult.url }),
              });
              const readJson = (await readRes.json()) as {
                presignedUrl?: string;
                error?: string;
              };
              if (!readRes.ok) {
                setPresignedGetError(
                  readJson.error ??
                    readRes.statusText ??
                    'presigned-read failed',
                );
              } else if (readJson.presignedUrl) {
                setPresignedGetUrl(readJson.presignedUrl);
              } else {
                setPresignedGetError('Missing presignedUrl in response');
              }
            } catch (readErr) {
              setPresignedGetError(
                readErr instanceof Error ? readErr.message : String(readErr),
              );
            }
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
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-sm inline-flex items-center"
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
          {presignedGetError ? (
            <p
              className="mt-2 text-sm text-amber-700"
              data-testid="presigned-get-error"
            >
              Presigned GET URL could not be issued: {presignedGetError}
            </p>
          ) : null}
          {presignedGetUrl ? (
            <p className="mt-2 break-all text-sm">
              <span className="font-medium">Presigned GET url: </span>
              <a
                className="text-blue-500 hover:underline"
                data-testid="presigned-get-url"
                href={presignedGetUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {presignedGetUrl}
              </a>
            </p>
          ) : null}
          {blob.url.endsWith('.mp4') ? (
            <video className="mt-2" controls data-testid="video-player">
              <source src={presignedGetUrl ?? blob.url} type="video/mp4" />
            </video>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
