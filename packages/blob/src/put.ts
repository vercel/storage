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
    bodyOrOptions: TPath extends `${string}/` ? TOptions : PutBody,
    ...optionsInput: TPath extends `${string}/` ? [] : [TOptions]
  ): Promise<PutBlobResult> {
    const isFolderCreation = pathname.endsWith('/');

    // prevent empty bodies for files
    if (!bodyOrOptions && !isFolderCreation) {
      throw new BlobError('body is required');
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check for non TS users that provide all three args
    if (bodyOrOptions && optionsInput && isFolderCreation) {
      throw new BlobError('body is not allowed for creating empty folders');
    }

    // avoid using the options as body
    const body = isFolderCreation ? undefined : bodyOrOptions;

    const options = await createPutOptions({
      pathname,
      // when no body is required (for folder creations) options are the second argument
      options: isFolderCreation
        ? (bodyOrOptions as TOptions)
        : (optionsInput as unknown as TOptions),
      extraChecks,
      getToken,
    });

    const headers = createPutHeaders(allowedOptions, options);

    if (options.multipart === true && body) {
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
