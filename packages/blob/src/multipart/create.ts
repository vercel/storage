import { BlobServiceNotAvailable, requestApi } from '../api';
import { debug } from '../debug';
import type { BlobCommandOptions, CommonCreateBlobOptions } from '../helpers';
import type { CreatePutMethodOptions } from '../put-helpers';
import { createPutHeaders, createPutOptions } from '../put-helpers';

export function createCreateMultipartUploadMethod<
  TOptions extends CommonCreateBlobOptions,
>({ allowedOptions, getToken, extraChecks }: CreatePutMethodOptions<TOptions>) {
  return async (pathname: string, optionsInput: TOptions) => {
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
  options: BlobCommandOptions,
): Promise<CreateMultipartUploadApiResponse> {
  debug('mpu: create', 'pathname:', pathname);

  const params = new URLSearchParams({ pathname });

  try {
    const response = await requestApi<CreateMultipartUploadApiResponse>(
      `/mpu?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'x-mpu-action': 'create',
        },
        signal: options.abortSignal,
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
    }

    throw error;
  }
}
