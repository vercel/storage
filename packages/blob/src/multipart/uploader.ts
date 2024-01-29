import type { CommonCreateBlobOptions } from '../helpers';
import type { CreatePutMethodOptions, PutBody } from '../put-helpers';
import { createPutHeaders, createPutOptions } from '../put-helpers';
import { completeMultipartUpload } from './complete';
import { createMultipartUpload } from './create';
import type { Part } from './helpers';
import { uploadPart } from './upload';

export function createCreateMultipartUploaderMethod<
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
      async uploadPart(partNumber: number, body: PutBody) {
        const result = await uploadPart({
          uploadId: createMultipartUploadResponse.uploadId,
          key: createMultipartUploadResponse.key,
          pathname,
          part: { partNumber, blob: body },
          headers,
          options,
        });

        return {
          etag: result.etag,
          partNumber,
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
