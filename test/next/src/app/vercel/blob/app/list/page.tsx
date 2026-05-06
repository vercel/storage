'use client';

import type * as vercelBlob from '@vercel/blob';
import { useCallback, useEffect, useState } from 'react';
import { API_ROOT } from '../../api/app/constants';

type PresignedPreview =
  | {
      pathname: string;
      presignedUrl: string;
      loading: false;
      fetchError?: string;
      imageError: boolean;
    }
  | { pathname: string; loading: true };

export default function AppList(): React.JSX.Element {
  const [result, setResult] = useState<vercelBlob.ListBlobResult>();
  const [searchPrefix, setSearchPrefix] = useState('');
  const [urlsToRemove, setUrlsToRemove] = useState<string[]>([]);
  const [head, setHead] = useState<vercelBlob.HeadBlobResult>();
  const [presignedPreview, setPresignedPreview] = useState<PresignedPreview>();

  const getList = useCallback(
    async (
      cursor: string | null,
      prefix: string = searchPrefix,
      reset = false,
    ) => {
      const search = new URLSearchParams();
      search.set('limit', '10');
      if (prefix) {
        search.set('prefix', prefix);
      }
      if (cursor) {
        search.set('cursor', cursor);
      }
      if (reset) {
        setResult(undefined);
      }
      const data = (await fetch(`${API_ROOT}/list?${search.toString()}`).then(
        (r) => r.json(),
      )) as vercelBlob.ListBlobResult;

      setResult({
        ...data,
        blobs: cursor ? [...(result?.blobs || []), ...data.blobs] : data.blobs,
      });
    },
    [result?.blobs, searchPrefix],
  );

  useEffect(() => {
    const doCall = async (): Promise<void> => {
      const data = (await fetch(`${API_ROOT}/list?limit=10`).then((r) =>
        r.json(),
      )) as vercelBlob.ListBlobResult;
      setResult(data);
    };
    void doCall();
  }, []);

  const handleDelete = async (urls: string[]): Promise<void> => {
    await fetch(`${API_ROOT}/delete`, {
      method: 'POST',
      body: JSON.stringify({ urls }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (result) {
      setResult({
        ...result,
        blobs: result.blobs.filter((b) => !urls.includes(b.url)),
      });
    }
  };

  const handleHead = async (url: string): Promise<void> => {
    const data = (await fetch(`${API_ROOT}/head`, {
      method: 'POST',
      body: JSON.stringify({ url }),
      headers: {
        'Content-Type': 'application/json',
      },
    }).then((r) => r.json())) as vercelBlob.HeadBlobResult;
    setHead(data);
  };

  const handlePresignedView = async (
    blob: vercelBlob.ListBlobResultBlob,
  ): Promise<void> => {
    setPresignedPreview({ pathname: blob.pathname, loading: true });
    try {
      const res = await fetch(`${API_ROOT}/presigned-read`, {
        method: 'POST',
        body: JSON.stringify({ url: blob.url }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as {
        presignedUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setPresignedPreview({
          pathname: blob.pathname,
          presignedUrl: '',
          loading: false,
          fetchError: data.error ?? res.statusText,
          imageError: true,
        });
        return;
      }
      if (typeof data.presignedUrl !== 'string' || data.presignedUrl === '') {
        setPresignedPreview({
          pathname: blob.pathname,
          presignedUrl: '',
          loading: false,
          fetchError: 'Missing presignedUrl in response',
          imageError: true,
        });
        return;
      }
      setPresignedPreview({
        pathname: blob.pathname,
        presignedUrl: data.presignedUrl,
        loading: false,
        imageError: false,
      });
    } catch (e) {
      setPresignedPreview({
        pathname: blob.pathname,
        presignedUrl: '',
        loading: false,
        fetchError: e instanceof Error ? e.message : String(e),
        imageError: true,
      });
    }
  };

  if (!result) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="text-xl mb-4">App Router List blob items</h1>
      <div className="flex gap-2">
        <input
          className="shadow-sm appearance-none border rounded-sm  py-2 px-3 text-gray-700 leading-tight focus:outline-hidden focus:shadow-outline"
          onChange={(e): void => {
            setSearchPrefix(e.target.value);
          }}
          placeholder="prefix"
          type="text"
          value={searchPrefix}
        />
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-sm"
          onClick={(): void => void getList('', searchPrefix)}
          type="button"
        >
          Search
        </button>
        <button
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-sm"
          onClick={(): void => void handleDelete(urlsToRemove)}
          type="button"
        >
          Multi-delete
        </button>
      </div>
      {presignedPreview ? (
        <div className="rounded-sm border border-gray-300 bg-gray-50 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Presigned GET preview: {presignedPreview.pathname}
            </h2>
            <button
              className="shrink-0 text-sm text-gray-600 underline hover:text-gray-900"
              onClick={(): void => setPresignedPreview(undefined)}
              type="button"
            >
              Close
            </button>
          </div>
          {presignedPreview.loading ? (
            <p>Issuing token and presigning URL…</p>
          ) : (
            <>
              {presignedPreview.fetchError ? (
                <p className="text-red-600">{presignedPreview.fetchError}</p>
              ) : null}
              {presignedPreview.presignedUrl ? (
                <>
                  <p className="break-all text-sm">
                    <span className="font-medium">Presigned URL: </span>
                    <a
                      className="text-blue-600 underline hover:text-blue-800"
                      href={presignedPreview.presignedUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {presignedPreview.presignedUrl}
                    </a>
                  </p>
                  {!presignedPreview.fetchError ? (
                    <div className="mt-2">
                      {presignedPreview.imageError ? (
                        <p className="text-sm text-gray-600">
                          Could not render as an image (non-image blob or load
                          error). Open the presigned URL above to download or
                          view in a new tab.
                        </p>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- presigned blob URL from runtime
                        <img
                          alt={presignedPreview.pathname}
                          className="max-h-96 max-w-full rounded-sm border border-gray-200 object-contain"
                          onError={(): void => {
                            setPresignedPreview((prev) =>
                              prev && !prev.loading
                                ? { ...prev, imageError: true }
                                : prev,
                            );
                          }}
                          src={presignedPreview.presignedUrl}
                        />
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        <li className="grid grid-cols-8 gap-2 font-medium">
          <p>Select</p>
          <p>path</p>
          <p>size</p>
          <p>download</p>
          <p>date</p>
          <p>presign</p>
          <p>Head</p>
          <p>Delete</p>
        </li>
        {result.blobs.map((blob) => (
          <li className="grid grid-cols-8 gap-2" key={blob.pathname}>
            <input
              className="w-auto"
              onChange={(e): void => {
                if (e.target.checked) {
                  setUrlsToRemove([...urlsToRemove, blob.url]);
                } else {
                  setUrlsToRemove(urlsToRemove.filter((u) => u !== blob.url));
                }
              }}
              type="checkbox"
            />
            <p>{blob.pathname}</p>
            <p>{blob.size}</p>
            <a
              className="text-underline text-blue-500 hover:text-blue-800"
              href={blob.url}
              rel="noopener"
              target="_blank"
            >
              download
            </a>
            <p>{new Date(blob.uploadedAt).toISOString()} </p>
            <button
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2 px-2 rounded-sm"
              onClick={(): void => void handlePresignedView(blob)}
              type="button"
            >
              View
            </button>
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-sm"
              onClick={(): void => void handleHead(blob.url)}
              type="button"
            >
              Head
            </button>
            <button
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-sm"
              onClick={(): void => void handleDelete([blob.url])}
              type="button"
            >
              X
            </button>
          </li>
        ))}
      </ul>
      {result.hasMore && result.cursor ? (
        <div>
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-sm"
            onClick={(): void =>
              void getList(result.cursor ?? '', searchPrefix)
            }
            type="button"
          >
            Load More
          </button>
          <div>Cursor: {result.cursor}</div>
        </div>
      ) : null}
      {head ? <div>{JSON.stringify(head)}</div> : null}
    </div>
  );
}
