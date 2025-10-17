/* eslint-disable -- I gave up making TS and ESLint happy here for now */

'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function Index() {
  const workerRef = useRef<Worker | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../../../worker.ts', import.meta.url),
    );
    workerRef.current.onmessage = (event: MessageEvent<string>) => {
      if (event.data.startsWith('Error:')) {
        alert(event.data);
      } else {
        setBlobUrl(event.data);
      }
    };
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  function handleUpload() {
    const fileName = searchParams?.get('fileName');
    const fileContent = searchParams?.get('fileContent');
    if (fileName && fileContent) {
      workerRef.current?.postMessage({ fileName, fileContent });
    } else {
      alert('Missing fileName or fileContent in search params');
    }
  }

  return (
    <>
      <h1 className="text-xl mb-4">
        App Router Client Upload using a Web Worker
      </h1>

      <button onClick={handleUpload}>Upload from WebWorker</button>
      {blobUrl && (
        <div>
          <p>
            Blob URL:{' '}
            <a
              id="test-result"
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {blobUrl}
            </a>
          </p>
        </div>
      )}
    </>
  );
}
