import type { BodyInit } from 'undici';
import { requestApi } from './api';
import { BlobError } from './helpers';
import { automaticMultipartPut } from './multipart/automatic-multipart-put';
import type {
  CreatePutOptions,
  CreatePutMethodOptions,
  PutBody,
  PutBlobApiResponse,
  PutBlobResult,
} from './put-helpers';
import { createPutOptions, createPutHeaders } from './put-helpers';

export function createPutMethod<TOptions extends CreatePutOptions>({
  allowedOptions,
  getToken,
  extraChecks,
}: CreatePutMethodOptions<TOptions>) {
  return async function put<TPath extends string>(
    pathname: TPath,
    bodyOrOptions: TPath extends `${string}/` ? TOptions : PutBody,
    optionsInput?: TPath extends `${string}/` ? never : TOptions,
  ): Promise<PutBlobResult> {
    const isFolderCreation = pathname.endsWith('/');

    // prevent empty bodies for files
    if (!bodyOrOptions && !isFolderCreation) {
      throw new BlobError('body is required');
    }

    // runtime check for non TS users that provide all three args
    if (bodyOrOptions && optionsInput && isFolderCreation) {
      throw new BlobError('body is not allowed for creating empty folders');
    }

    // avoid using the options as body
    const body = isFolderCreation ? undefined : bodyOrOptions;

    const options = await createPutOptions(
      pathname,
      // when no body is required (for folder creations) options are the second argument
      isFolderCreation ? (bodyOrOptions as TOptions) : optionsInput,
      extraChecks,
      getToken,
    );

    const headers = createPutHeaders(allowedOptions, options);

    if (options.multipart === true && body) {
      return automaticMultipartPut(pathname, body, headers, options);
    }

    return requestApi<PutBlobApiResponse>(
      `/${pathname}`,
      {
        method: 'PUT',
        body: body as BodyInit,
        headers,
        // required in order to stream some body types to Cloudflare
        // currently only supported in Node.js, we may have to feature detect this
        duplex: 'half',
      },
      options,
    );
  };
}
