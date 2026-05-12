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
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [headStatus, setHeadStatus] = useState<string | null>(null);
  const [headError, setHeadError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<string[]>([]);
  const searchParams = useSearchParams();

  const handlePresignedHead = async (blobUrl: string): Promise<void> => {
    setHeadStatus(null);
    setHeadError(null);
    try {
      const issueRes = await fetch(`${API_ROOT}/presigned-head`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: blobUrl }),
      });
      const issueJson = (await issueRes.json()) as {
        presignedUrl?: string;
        error?: string;
      };
      if (!issueRes.ok || !issueJson.presignedUrl) {
        setHeadError(
          issueJson.error ?? issueRes.statusText ?? 'presigned-head failed',
        );
        return;
      }
      const headRes = await fetch(issueJson.presignedUrl, { method: 'HEAD' });
      if (!headRes.ok) {
        setHeadError(`HTTP ${headRes.status}: ${headRes.statusText}`);
        return;
      }
      const summary = [
        `status=${headRes.status}`,
        `content-type=${headRes.headers.get('content-type') ?? '-'}`,
        `content-length=${headRes.headers.get('content-length') ?? '-'}`,
      ].join(' • ');
      setHeadStatus(summary);
    } catch (err) {
      setHeadError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePresignedDelete = async (blobUrl: string): Promise<void> => {
    setDeleteStatus(null);
    setDeleteError(null);
    try {
      const issueRes = await fetch(`${API_ROOT}/presigned-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: blobUrl }),
      });
      const issueJson = (await issueRes.json()) as {
        presignedUrl?: string;
        error?: string;
      };
      if (!issueRes.ok || !issueJson.presignedUrl) {
        setDeleteError(
          issueJson.error ?? issueRes.statusText ?? 'presigned-delete failed',
        );
        return;
      }
      const delRes = await fetch(issueJson.presignedUrl, {
        method: 'DELETE',
      });
      if (!delRes.ok) {
        const text = await delRes.text();
        setDeleteError(`HTTP ${delRes.status}: ${text || delRes.statusText}`);
        return;
      }
      setDeleteStatus('Deleted via presigned URL');
      setBlob(null);
      setPresignedGetUrl(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  };

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
          <button
            className="mt-2 mr-2 bg-blue-300 hover:bg-blue-400 text-gray-800 font-bold py-2 px-4 rounded-sm inline-flex items-center"
            data-testid="presigned-head-button"
            onClick={() => {
              void handlePresignedHead(blob.url);
            }}
            type="button"
          >
            HEAD (presigned)
          </button>
          <button
            className="mt-2 bg-red-300 hover:bg-red-400 text-gray-800 font-bold py-2 px-4 rounded-sm inline-flex items-center"
            data-testid="presigned-delete-button"
            onClick={() => {
              void handlePresignedDelete(blob.url);
            }}
            type="button"
          >
            Delete (presigned)
          </button>
        </div>
      ) : null}

      {headStatus ? (
        <p
          className="mt-2 text-sm text-green-700"
          data-testid="presigned-head-status"
        >
          {headStatus}
        </p>
      ) : null}
      {headError ? (
        <p
          className="mt-2 text-sm text-red-700"
          data-testid="presigned-head-error"
        >
          Presigned HEAD failed: {headError}
        </p>
      ) : null}

      {deleteStatus ? (
        <p
          className="mt-2 text-sm text-green-700"
          data-testid="presigned-delete-status"
        >
          {deleteStatus}
        </p>
      ) : null}
      {deleteError ? (
        <p
          className="mt-2 text-sm text-red-700"
          data-testid="presigned-delete-error"
        >
          Presigned delete failed: {deleteError}
        </p>
      ) : null}
    </>
  );
}
