import type { Response as UndiciResponse } from 'undici';
import { isReadableStream, type BlobRequest } from './helpers';
import { debug } from './debug';

export const hasXhr = typeof XMLHttpRequest !== 'undefined';

export const blobXhr: BlobRequest = async ({
  input,
  init,
  onUploadProgress,
}) => {
  debug('using xhr');
  let body: XMLHttpRequestBodyInit | null = null;

  // xhr.send only support XMLHttpRequestBodyInit types, excluding ReadableStream (web)
  // and Readable (node)
  // We do have to support ReadableStream being sent to xhr as our library allows
  // for Safari to use put(path, ReadableStream, { onUploadProgress }) which would
  // end up here.
  // We do not have to support Readable being sent to xhr as using Node.js you would
  // endup in the fetch implementation by default.
  if (init.body) {
    if (isReadableStream(init.body)) {
      body = await new Response(init.body).blob();
    } else {
      // We "type lie" here, what we should do instead:
      // Exclude ReadableStream:
      // body = init.body as Exclude<PutBody, ReadableStream | Readable>;
      // We can't do this because init.body (PutBody) relies on Blob (node:buffer)
      // while XMLHttpRequestBodyInit relies on native Blob type.
      // If we get rid of undici we can remove this trick.
      body = init.body as XMLHttpRequestBodyInit;
    }
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || 'GET', input.toString(), true);

    // Handle upload progress
    if (onUploadProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onUploadProgress(event.loaded);
        }
      });
    }

    // Handle response
    xhr.onload = () => {
      if (init.signal?.aborted) {
        reject(new DOMException('The user aborted the request.', 'AbortError'));
        return;
      }

      const headers = new Headers();
      const rawHeaders = xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/);

      // Parse headers
      rawHeaders.forEach((line) => {
        const parts = line.split(': ');
        const key = parts.shift();
        const value = parts.join(': ');
        if (key) headers.set(key.toLowerCase(), value);
      });

      // Create response object, api-blob sends back text and api.ts will turn it into json if necessary
      const response = new Response(xhr.response as string, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers,
      }) as unknown as UndiciResponse;

      resolve(response);
    };

    // Handle network errors
    xhr.onerror = () => {
      reject(new TypeError('Network request failed'));
    };

    // Handle timeouts
    xhr.ontimeout = () => {
      reject(new TypeError('Network request timed out'));
    };

    // Handle aborts
    xhr.onabort = () => {
      reject(new DOMException('The user aborted a request.', 'AbortError'));
    };

    // Set headers
    if (init.headers) {
      const headers = new Headers(init.headers as HeadersInit);
      headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
    }

    // Handle abort signal
    if (init.signal) {
      init.signal.addEventListener('abort', () => {
        xhr.abort();
      });

      // If already aborted, abort xhr immediately
      if (init.signal.aborted) {
        xhr.abort();
        return;
      }
    }

    // We're cheating and saying that nobody is gonna use put() with a stream in an environment not supporting
    // fetch with streams. If this ever happens please open an issue and we'll figure it out.
    xhr.send(body);
  });
};
