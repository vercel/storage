import { requestApi, BlobServiceNotAvailable } from '../api';
import { debug } from '../debug';
import type { BlobCommandOptions } from '../helpers';
import type { PutBlobApiResponse, PutBlobResult } from '../put-helpers';
import type { CompletedPart } from './helpers';

export async function completeMultiPartUpload(
  uploadId: string,
  key: string,
  pathname: string,
  parts: CompletedPart[],
  headers: Record<string, string>,
  options: BlobCommandOptions,
): Promise<PutBlobResult> {
  try {
    const response = await requestApi<PutBlobApiResponse>(
      `/mpu/${pathname}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'x-mpu-action': 'complete',
          'x-mpu-upload-id': uploadId,
          // key can be any utf8 character so we need to encode it as HTTP headers can only be us-ascii
          // https://www.rfc-editor.org/rfc/rfc7230#swection-3.2.4
          'x-mpu-key': encodeURI(key),
        },
        body: JSON.stringify(parts),
      },
      options,
    );

    debug('mpu: complete', response);

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
