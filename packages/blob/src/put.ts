import throttle from 'throttleit';
import { requestApi } from './api';
import type { CommonCreateBlobOptions, WithUploadProgress } from './helpers';
import { BlobError, isPlainObject } from './helpers';
import { uncontrolledMultipartUpload } from './multipart/uncontrolled';
import type {
  CreatePutMethodOptions,
  OptimizeImageOptions,
  PutBlobApiResponse,
  PutBlobResult,
  PutBody,
} from './put-helpers';
import {
  addOptimizeImageParams,
  createPutHeaders,
  createPutOptions,
  validateOptimizeImageSourceContentType,
} from './put-helpers';

export interface PutCommandOptions
  extends CommonCreateBlobOptions,
    WithUploadProgress {
  /**
   * Whether to use multipart upload. Use this when uploading large files. It will split the file into multiple parts, upload them in parallel and retry failed parts.
   * @defaultvalue false
   */
  multipart?: boolean;
  /**
   * Optimize the image through Vercel Image Optimization before storing it.
   * Only the optimized output is stored. Requires OIDC authentication and is
   * billed as an image transformation plus a regular blob put.
   */
  optimizeImage?: OptimizeImageOptions;
}

export function createPutMethod<TOptions extends PutCommandOptions>({
  allowedOptions,
  getToken,
  getPresignedUrlPayload,
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

    const presignedUrlPayload = await getPresignedUrlPayload?.(
      pathname,
      options,
    );

    const optionsWithPresignedUrlPayload = {
      ...options,
      presignedUrlPayload,
    };

    const headers = createPutHeaders(allowedOptions, options);

    if (options.optimizeImage) {
      if (options.multipart === true) {
        throw new BlobError(
          'optimizeImage cannot be combined with multipart uploads',
        );
      }

      // The `contentType` option or a Blob/File `type` reveals a non-image
      // source without reading the body; File extends Blob.
      validateOptimizeImageSourceContentType(
        options.contentType ??
          (typeof Blob !== 'undefined' && body instanceof Blob
            ? body.type
            : undefined),
      );

      const params = new URLSearchParams({ pathname });
      addOptimizeImageParams(params, options.optimizeImage);

      const response = await requestApi<PutBlobApiResponse>(
        `/put-optimized?${params.toString()}`,
        {
          method: 'POST',
          body,
          headers,
          signal: options.abortSignal,
        },
        optionsWithPresignedUrlPayload,
      );

      return {
        url: response.url,
        downloadUrl: response.downloadUrl,
        pathname: response.pathname,
        contentType: response.contentType,
        contentDisposition: response.contentDisposition,
        etag: response.etag,
      };
    }

    if (options.multipart === true) {
      return uncontrolledMultipartUpload(
        pathname,
        body,
        headers,
        optionsWithPresignedUrlPayload,
      );
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
        ...optionsWithPresignedUrlPayload,
        onUploadProgress,
      },
    );

    return {
      url: response.url,
      downloadUrl: response.downloadUrl,
      pathname: response.pathname,
      contentType: response.contentType,
      contentDisposition: response.contentDisposition,
      etag: response.etag,
    };
  };
}
