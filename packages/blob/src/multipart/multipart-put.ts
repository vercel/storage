import { BlobError, type CreateBlobCommandOptions } from '../helpers';
import {
  createPutOptions,
  type CreatePutMethodOptions,
  type CreatePutOptions,
  type PutBlobResult,
  type PutBody,
  createPutHeaders,
} from '../put-helpers';
import { completeMultiPartUpload } from './complete';
import { createMultiPartUpload } from './create';
import { uploadAllParts, uploadPart } from './upload';
import { toReadableStream, type CompletedPart } from './helpers';

export type PutCommandOptions = CreateBlobCommandOptions;

export interface MultipartPutResult {
  id: string;
  key: string;
  uploadPart: (body: PutBody) => Promise<void>;
  complete: () => Promise<PutBlobResult>;
}

export function createMultipartPut<TOptions extends CreatePutOptions>({
  allowedOptions,
  getToken,
  extraChecks,
}: CreatePutMethodOptions<TOptions>) {
  return async function multipartPut(
    pathname: string,
    optionsInput: TOptions,
  ): Promise<MultipartPutResult> {
    if (!pathname) {
      throw new BlobError('pathname is required');
    }

    const options = await createPutOptions(
      pathname,
      optionsInput,
      extraChecks,
      getToken,
    );

    const headers = createPutHeaders(allowedOptions, options);

    const createMultipartUploadResponse = await createMultiPartUpload(
      pathname,
      headers,
      options,
    );

    let parts: CompletedPart[] = [];

    return {
      key: createMultipartUploadResponse.key,
      id: createMultipartUploadResponse.uploadId,
      async uploadPart(body) {
        const stream = toReadableStream(body);

        const response = await uploadAllParts(
          createMultipartUploadResponse.uploadId,
          createMultipartUploadResponse.key,
          pathname,
          stream,
          headers,
          options,
        );

        console.log({ response });

        parts = [...parts, ...response];
      },
      async complete() {
        return completeMultiPartUpload(
          createMultipartUploadResponse.uploadId,
          createMultipartUploadResponse.key,
          pathname,
          parts,
          headers,
          options,
        );
      },
    };
  };
}
