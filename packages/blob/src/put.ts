import throttle from 'throttleit';
import { requestApi } from './api';
import type { CommonCreateBlobOptions, WithUploadProgress } from './helpers';
import { BlobError, isPlainObject } from './helpers';
import { uncontrolledMultipartUpload } from './multipart/uncontrolled';
import type {
  CreatePutMethodOptions,
  PutBody,
  PutBlobApiResponse,
  PutBlobResult,
} from './put-helpers';
import { createPutOptions, createPutHeaders } from './put-helpers';

export interface PutCommandOptions
  extends CommonCreateBlobOptions,
    WithUploadProgress {
  /**
   * Whether to use multipart upload. Use this when uploading large files. It will split the file into multiple parts, upload them in parallel and retry failed parts.
   * @defaultvalue false
   */
  multipart?: boolean;
}

export function createPutMethod<TOptions extends PutCommandOptions>({
  allowedOptions,
  getToken,
  extraChecks,
}: CreatePutMethodOptions<TOptions>) {
  return async function put(
    pathname: string,
    body: PutBody,
    optionsInput: TOptions,
  ): Promise<PutBlobResult> {
    if (!body) {
      throw new BlobError('body is required');
    }

    if (isPlainObject(body)) {
      throw new BlobError(
        "Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload.",
      );
    }

    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken,
    });

    const headers = createPutHeaders(allowedOptions, options);

    if (options.multipart === true) {
      return uncontrolledMultipartUpload(pathname, body, headers, options);
    }

    const onUploadProgress = options.onUploadProgress
      ? throttle(options.onUploadProgress, 100)
      : undefined;

    const params = new URLSearchParams({ pathname });

    const response = await requestApi<PutBlobApiResponse>(
      `/?${params.toString()}`,
      {
        method: 'PUT',
        body,
        headers,
        signal: options.abortSignal,
      },
      {
        ...options,
        onUploadProgress,
      },
    );

    return {
      url: response.url,
      downloadUrl: response.downloadUrl,
      pathname: response.pathname,
      contentType: response.contentType,
      contentDisposition: response.contentDisposition,
    };
  };
}
