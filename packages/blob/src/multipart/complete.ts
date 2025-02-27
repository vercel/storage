import { BlobServiceNotAvailable, requestApi } from '../api';
import { debug } from '../debug';
import type { CommonCreateBlobOptions, BlobCommandOptions } from '../helpers';
import type {
  CreatePutMethodOptions,
  PutBlobApiResponse,
  PutBlobResult,
} from '../put-helpers';
import { createPutHeaders, createPutOptions } from '../put-helpers';
import type { Part } from './helpers';

// shared interface for server and client
export interface CommonCompleteMultipartUploadOptions {
  uploadId: string;
  key: string;
}

export type CompleteMultipartUploadCommandOptions =
  CommonCompleteMultipartUploadOptions & CommonCreateBlobOptions;

export function createCompleteMultipartUploadMethod<
  TOptions extends CompleteMultipartUploadCommandOptions,
>({ allowedOptions, getToken, extraChecks }: CreatePutMethodOptions<TOptions>) {
  return async (pathname: string, parts: Part[], optionsInput: TOptions) => {
    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken,
    });

    const headers = createPutHeaders(allowedOptions, options);

    return completeMultipartUpload({
      uploadId: options.uploadId,
      key: options.key,
      pathname,
      headers,
      options,
      parts,
    });
  };
}

export async function completeMultipartUpload({
  uploadId,
  key,
  pathname,
  parts,
  headers,
  options,
}: {
  uploadId: string;
  key: string;
  pathname: string;
  parts: Part[];
  headers: Record<string, string>;
  options: BlobCommandOptions;
}): Promise<PutBlobResult> {
  const params = new URLSearchParams({ pathname });

  try {
    const response = await requestApi<PutBlobApiResponse>(
      `/mpu?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'x-mpu-action': 'complete',
          'x-mpu-upload-id': uploadId,
          // key can be any utf8 character so we need to encode it as HTTP headers can only be us-ascii
          // https://www.rfc-editor.org/rfc/rfc7230#swection-3.2.4
          'x-mpu-key': encodeURIComponent(key),
        },
        body: JSON.stringify(parts),
        signal: options.abortSignal,
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
