import type { BodyInit } from 'undici';
import { requestApi } from './api';
import type { CommonCreateBlobOptions } from './helpers';
import { BlobError } from './helpers';
import { uncontrolledMultipartUpload } from './multipart/uncontrolled';
import type {
  CreatePutMethodOptions,
  PutBody,
  PutBlobApiResponse,
  PutBlobResult,
} from './put-helpers';
import { createPutOptions, createPutHeaders } from './put-helpers';

export interface PutCommandOptions extends CommonCreateBlobOptions {
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
  return async function put<TPath extends string>(
    pathname: TPath,
    body: PutBody,
    optionsInput: TOptions,
  ): Promise<PutBlobResult> {
    // prevent empty bodies for files
    if (!body) {
      throw new BlobError('body is required');
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

    const response = await requestApi<PutBlobApiResponse>(
      `/${pathname}`,
      {
        method: 'PUT',
        body: body as BodyInit,
        headers,
        // required in order to stream some body types to Cloudflare
        // currently only supported in Node.js, we may have to feature detect this
        // note: this doesn't send a content-length to the server
        duplex: 'half',
        signal: options.abortSignal,
      },
      options,
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
