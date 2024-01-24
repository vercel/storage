import { BlobServiceNotAvailable } from '../api';
import type { CompletedPart, UploadPart } from '../put-multipart';
import type { BlobCommandOptions } from '../helpers';
import { MultipartApi } from './multipart-api';
import { MultipartMemory } from './multipart-memory';
import { MultipartReader } from './multipart-reader';

export function uploadAllParts(
  uploadId: string,
  key: string,
  pathname: string,
  stream: ReadableStream<ArrayBuffer>,
  headers: Record<string, string>,
  options: BlobCommandOptions,
): Promise<CompletedPart[]> {
  return new Promise((resolve, reject) => {
    const memory = new MultipartMemory();

    const api = new MultipartApi(
      uploadId,
      key,
      pathname,
      headers,
      options,
      memory,
    );

    const reader = new MultipartReader(memory);

    function cancel(error: unknown): void {
      api.cancel();
      reader.cancel();

      if (
        error instanceof TypeError &&
        (error.message === 'Failed to fetch' ||
          error.message === 'fetch failed')
      ) {
        reject(new BlobServiceNotAvailable());
      } else {
        reject(error);
      }
    }

    const completedParts: CompletedPart[] = [];

    api.on('completePart', (part: CompletedPart) => {
      completedParts.push(part);

      if (reader.done && api.activeUploads === 0 && !api.hasPartsToUpload) {
        resolve(completedParts);
      }
    });

    api.on('error', cancel);

    reader.on('done', () => {
      // upload any remaining data
      reader.flush();
    });

    reader.on('part', (part: UploadPart) => {
      // queue part for upload
      api.enqueuePart(part);
    });

    reader.on('error', cancel);

    // pass stream to reader
    reader.streamReader = stream.getReader();

    // kickof reader emitted parts will be uploaded
    void reader.read();
  });
}
