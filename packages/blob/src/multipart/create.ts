import { requestApi, BlobServiceNotAvailable } from '../api';
import { debug } from '../debug';
import type { BlobCommandOptions } from '../helpers';

interface CreateMultiPartUploadApiResponse {
  uploadId: string;
  key: string;
}

export async function createMultiPartUpload(
  pathname: string,
  headers: Record<string, string>,
  options: BlobCommandOptions,
): Promise<CreateMultiPartUploadApiResponse> {
  debug('mpu: create', 'pathname:', pathname);

  try {
    const response = await requestApi<CreateMultiPartUploadApiResponse>(
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
