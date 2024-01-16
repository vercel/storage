'use client';

import type * as vercelBlob from '@vercel/blob';
import { useCallback, useEffect, useState } from 'react';
import { API_ROOT } from '../../api/app/constants';

export default function AppList(): JSX.Element {
  const [result, setResult] = useState<vercelBlob.ListBlobResult>();
  const [searchPrefix, setSearchPrefix] = useState('');
  const [urlsToRemove, setUrlsToRemove] = useState<string[]>([]);
  const [head, setHead] = useState<vercelBlob.HeadBlobResult>();

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

  if (!result) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="text-xl mb-4">App Router List blob items</h1>
      <div className="flex gap-2">
        <input
          className="shadow appearance-none border rounded  py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          onChange={(e): void => {
            setSearchPrefix(e.target.value);
          }}
          placeholder="prefix"
          type="text"
          value={searchPrefix}
        />
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={(): void => void getList('', searchPrefix)}
          type="button"
        >
          Search
        </button>
        <button
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          onClick={(): void => void handleDelete(urlsToRemove)}
          type="button"
        >
          Multi-delete
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        <li className="grid grid-cols-7 gap-2">
          <p>Select</p>
          <p>path</p>
          <p>size</p>
          <p>download</p>
          <p>date</p>
        </li>
        {result.blobs.map((blob) => (
          <li className="grid grid-cols-7 gap-2" key={blob.pathname}>
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
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              onClick={(): void => void handleHead(blob.url)}
              type="button"
            >
              Head
            </button>
            <button
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
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
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
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
