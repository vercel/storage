import { BlobServiceNotAvailable, requestApi } from '../api';
import { debug } from '../debug';
import type { BlobOptions, CommonCreateBlobOptions } from '../helpers';
import type { PutBody, CreatePutMethodOptions } from '../put-helpers';
import { createPutHeaders, createPutOptions } from '../put-helpers';
import { completeMultipartUpload } from './complete';
import type { Part } from './helpers';
import { uploadPart } from './upload';

export function createCreateMultipartPutMethod<
  TOptions extends CommonCreateBlobOptions,
>({ allowedOptions, getToken, extraChecks }: CreatePutMethodOptions<TOptions>) {
  return async function multipartPut(pathname: string, optionsInput: TOptions) {
    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken,
    });

    const headers = createPutHeaders(allowedOptions, options);

    const createMultipartUploadResponse = await createMultipartUpload(
      pathname,
      headers,
      options,
    );

    return {
      key: createMultipartUploadResponse.key,
      uploadId: createMultipartUploadResponse.uploadId,

      async put(partNumber: number, body: PutBody) {
        const result = await uploadPart({
          uploadId: createMultipartUploadResponse.uploadId,
          key: createMultipartUploadResponse.key,
          pathname,
          part: { partNumber, blob: body },
          headers,
          options,
        });

        return {
          partNumber,
          etag: result.etag,
        };
      },

      async complete(parts: Part[]) {
        return completeMultipartUpload({
          uploadId: createMultipartUploadResponse.uploadId,
          key: createMultipartUploadResponse.key,
          pathname,
          parts,
          headers,
          options,
        });
      },
    };
  };
}

interface CreateMultipartUploadApiResponse {
  uploadId: string;
  key: string;
}

export async function createMultipartUpload(
  pathname: string,
  headers: Record<string, string>,
  options: BlobOptions,
): Promise<CreateMultipartUploadApiResponse> {
  debug('mpu: create', 'pathname:', pathname);

  try {
    const response = await requestApi<CreateMultipartUploadApiResponse>(
      `/mpu/${pathname}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'x-mpu-action': 'create',
        },
      },
      options,
    );

    debug('mpu: create', response);

    return response;
  } catch (error: unknown) {
    if (
      error instanceof TypeError &&
      (error.message === 'Failed to fetch' || error.message === 'fetch failed')
    ) {
      throw new BlobServiceNotAvailable();
    } else {
      throw error;
    }
  }
}
