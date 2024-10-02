import {
  BlobError,
  isPlainObject,
  type CommonCreateBlobOptions,
} from '../helpers';
import type { CreatePutMethodOptions, PutBody } from '../put-helpers';
import { createPutHeaders, createPutOptions } from '../put-helpers';
import { completeMultipartUpload } from './complete';
import { createMultipartUpload } from './create';
import type { Part } from './helpers';
import { uploadPart as rawUploadPart } from './upload';

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
      key: createMultipartUploadResponse.key,
      uploadId: createMultipartUploadResponse.uploadId,

      async uploadPart(partNumber: number, body: PutBody) {
        if (isPlainObject(body)) {
          throw new BlobError(
            "Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload.",
          );
        }

        const result = await rawUploadPart({
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
