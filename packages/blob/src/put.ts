import type { Readable } from 'node:stream';
import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import type { ClientPutCommandOptions } from './client';
import type { CreateBlobCommandOptions } from './helpers';
import {
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
  BlobError,
  validateBlobApiResponse,
} from './helpers';

// eslint-disable-next-line @typescript-eslint/no-empty-interface -- expose option interface for each API method for better extensibility in the future
export interface PutCommandOptions extends CreateBlobCommandOptions {}

const putOptionHeaderMap = {
  cacheControlMaxAge: 'x-cache-control-max-age',
  addRandomSuffix: 'x-add-random-suffix',
  contentType: 'x-content-type',
};

export interface PutBlobResult {
  url: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

export type PutBlobApiResponse = PutBlobResult;

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function createPutMethod<
  T extends PartialBy<PutCommandOptions & ClientPutCommandOptions, 'token'>,
>({
  allowedOptions,
  getToken,
  extraChecks,
}: {
  allowedOptions: (keyof typeof putOptionHeaderMap)[];
  getToken?: (pathname: string, options: T) => Promise<string>;
  extraChecks?: (options: T) => void;
}) {
  return async function put<TPath extends string>(
    pathname: TPath,
    bodyOrOptions: TPath extends `${string}/`
      ? T
      :
          | string
          | Readable
          | Blob
          | ArrayBuffer
          | FormData
          | ReadableStream
          | File,
    optionsInput?: T,
  ): Promise<PutBlobResult> {
    if (!pathname) {
      throw new BlobError('pathname is required');
    }

    const isEmptyFolder = pathname.endsWith('/');

    // avoid using the options as body
    const body = isEmptyFolder ? undefined : (bodyOrOptions as BodyInit);

    // when no body is required options are the second argument
    const options = isEmptyFolder ? (bodyOrOptions as T) : optionsInput;

    // prevent empty bodies for files
    if (!body && !isEmptyFolder) {
      throw new BlobError('body is required');
    }

    // runtime check for non TS users that provide all three args
    if (bodyOrOptions && optionsInput && isEmptyFolder) {
      throw new BlobError('body is not allowed for creating empty folders');
    }

    if (!options) {
      throw new BlobError('missing options, see usage');
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
    if (options.access !== 'public') {
      throw new BlobError('access must be "public"');
    }

    if (extraChecks) {
      extraChecks(options);
    }

    const token = getToken
      ? await getToken(pathname, options)
      : getTokenFromOptionsOrEnv(options);

    const headers: Record<string, string> = {
      ...getApiVersionHeader(),
      authorization: `Bearer ${token}`,
    };

    if (allowedOptions.includes('contentType') && options.contentType) {
      headers['x-content-type'] = options.contentType;
    }

    if (
      allowedOptions.includes('addRandomSuffix') &&
      options.addRandomSuffix !== undefined
    ) {
      headers['x-add-random-suffix'] = options.addRandomSuffix ? '1' : '0';
    }

    if (
      allowedOptions.includes('cacheControlMaxAge') &&
      options.cacheControlMaxAge !== undefined
    ) {
      headers['x-cache-control-max-age'] =
        options.cacheControlMaxAge.toString();
    }

    const blobApiResponse = await fetch(getApiUrl(`/${pathname}`), {
      method: 'PUT',
      body,
      headers,
      // required in order to stream some body types to Cloudflare
      // currently only supported in Node.js, we may have to feature detect this
      duplex: 'half',
    });

    await validateBlobApiResponse(blobApiResponse);

    const blobResult = (await blobApiResponse.json()) as PutBlobApiResponse;

    return blobResult;
  };
}
