'use client';

import type * as vercelBlob from '@vercel/blob';
import { useCallback, useEffect, useState } from 'react';
import { API_ROOT } from '../../api/app/constants';

export default function AppList(): JSX.Element {
  const [result, setResult] = useState<vercelBlob.ListBlobResult>();
  const [searchPrefix, setSearchPrefix] = useState('');
  const [urlsToRemove, setUrlsToRemove] = useState<string[]>([]);

  const getList = useCallback(
    async (cursor: string, prefix: string = searchPrefix) => {
      const search = new URLSearchParams();
      search.set('limit', '10');
      if (prefix) {
        search.set('prefix', prefix);
      }
      if (cursor) {
        search.set('cursor', cursor);
      }
      const data = (await fetch(`${API_ROOT}/list?${search.toString()}`).then(
        (r) => r.json()
      )) as vercelBlob.ListBlobResult;
      setResult({
        ...data,
        blobs: cursor ? [...(result?.blobs || []), ...data.blobs] : data.blobs,
      });
    },
    [result?.blobs, searchPrefix]
  );

  useEffect(() => {
    const doCall = async (): Promise<void> => {
      const data = (await fetch(`${API_ROOT}/list?limit=10`).then((r) =>
        r.json()
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
    await getList('', searchPrefix);
  };

  if (!result) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <h1>App Router List blob items</h1>
      <input
        onChange={(e): void => setSearchPrefix(e.target.value)}
        placeholder="prefix"
        type="text"
        value={searchPrefix}
      />
      <button
        onClick={(): void => void getList('', searchPrefix)}
        type="button"
      >
        Search
      </button>

      <button
        onClick={(): void => void handleDelete(urlsToRemove)}
        type="button"
      >
        Multi-delete
      </button>
      <ul>
        {result.blobs.map((blob) => (
          <li key={blob.pathname}>
            <input
              onChange={(e): void => {
                if (e.target.checked) {
                  setUrlsToRemove([...urlsToRemove, blob.url]);
                } else {
                  setUrlsToRemove(urlsToRemove.filter((u) => u !== blob.url));
                }
              }}
              type="checkbox"
            />
            {blob.pathname} - {blob.size} -
            {new Date(blob.uploadedAt).toISOString()} - {blob.url}
            <button
              onClick={(): void => void handleDelete([blob.url])}
              type="button"
            >
              X
            </button>
          </li>
        ))}
      </ul>
      {result.hasMore && result.cursor ? (
        <>
          <button
            onClick={(): void =>
              void getList(result.cursor ?? '', searchPrefix)
            }
            type="button"
          >
            Load More
          </button>
          <div>Cursor: {result.cursor}</div>
        </>
      ) : null}
    </>
  );
}
