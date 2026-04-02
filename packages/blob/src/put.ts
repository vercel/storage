import throttle from 'throttleit';
import { requestApi } from './api';
import type { CommonCreateBlobOptions, WithUploadProgress } from './helpers';
import { BlobError, isPlainObject } from './helpers';
import { uncontrolledMultipartUpload } from './multipart/uncontrolled';
import type {
  CreatePutMethodOptions,
  PutBlobApiResponse,
  PutBlobResult,
  PutBody,
} from './put-helpers';
import { createPutHeaders, createPutOptions } from './put-helpers';

export interface PutCommandOptions
  extends CommonCreateBlobOptions,
    WithUploadProgress {
  /**
   * Whether to use multipart upload. Use this when uploading large files. It will split the file into multiple parts, upload them in parallel and retry failed parts.
   * @defaultvalue false
   */
  multipart?: boolean;
}

function normalizeContentDisposition(
  contentDisposition: string,
  originalPathname: string,
  responsePathname: string,
): string {
  const originalFilename =
    originalPathname.split('/').pop() ?? originalPathname;
  const responseFilename =
    responsePathname.split('/').pop() ?? responsePathname;
  if (
    originalFilename !== responseFilename &&
    contentDisposition.includes(`"${responseFilename}"`)
  ) {
    return contentDisposition.replace(
      `"${responseFilename}"`,
      `"${originalFilename}"`,
    );
  }
  return contentDisposition;
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
      const result = await uncontrolledMultipartUpload(
        pathname,
        body,
        headers,
        options,
      );
      return {
        ...result,
        contentDisposition: normalizeContentDisposition(
          result.contentDisposition,
          pathname,
          result.pathname,
        ),
      };
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
      contentDisposition: normalizeContentDisposition(
        response.contentDisposition,
        pathname,
        response.pathname,
      ),
      etag: response.etag,
    };
  };
}
