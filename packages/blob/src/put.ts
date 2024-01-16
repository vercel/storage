// eslint-disable-next-line unicorn/prefer-node-protocol -- node:stream does not resolve correctly in browser and edge
import type { Readable } from 'stream';
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
import { multipartPut } from './put-multipart';

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

export type PutBody =
  | string
  | Readable // Node.js streams
  | Blob
  | ArrayBuffer
  | ReadableStream // Streams API (= Web streams in Node.js)
  | File;

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
    bodyOrOptions: TPath extends `${string}/` ? T : PutBody,
    optionsInput?: T,
  ): Promise<PutBlobResult> {
    if (!pathname) {
      throw new BlobError('pathname is required');
    }

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

    // when no body is required options are the second argument
    const options = isFolderCreation ? (bodyOrOptions as T) : optionsInput;

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

    if (options.multipart === true && body) {
      return multipartPut(pathname, body, headers);
    }

    const blobApiResponse = await fetch(getApiUrl(`/${pathname}`), {
      method: 'PUT',
      body: body as BodyInit,
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
