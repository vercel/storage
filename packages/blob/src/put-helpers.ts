// eslint-disable-next-line unicorn/prefer-node-protocol -- node:stream does not resolve correctly in browser and edge
import type { Readable } from 'stream';
import type { ClientPutCommandOptions } from './client';
import type { CreateBlobCommandOptions, PartialBy } from './helpers';
import { BlobError } from './helpers';

export type PutCommandOptions = CreateBlobCommandOptions;

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

export type CreatePutOptions = PartialBy<
  PutCommandOptions & ClientPutCommandOptions,
  'token'
>;

export interface CreatePutMethodOptions<TOptions> {
  allowedOptions: (keyof typeof putOptionHeaderMap)[];
  getToken?: (pathname: string, options: TOptions) => Promise<string>;
  extraChecks?: (options: TOptions) => void;
}

export function createPutHeaders<TOptions extends CreatePutOptions>(
  allowedOptions: CreatePutMethodOptions<TOptions>['allowedOptions'],
  options: TOptions,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (allowedOptions.includes('contentType') && options.contentType) {
    headers[putOptionHeaderMap.contentType] = options.contentType;
  }

  if (
    allowedOptions.includes('addRandomSuffix') &&
    options.addRandomSuffix !== undefined
  ) {
    headers[putOptionHeaderMap.addRandomSuffix] = options.addRandomSuffix
      ? '1'
      : '0';
  }

  if (
    allowedOptions.includes('cacheControlMaxAge') &&
    options.cacheControlMaxAge !== undefined
  ) {
    headers[putOptionHeaderMap.cacheControlMaxAge] =
      options.cacheControlMaxAge.toString();
  }

  return headers;
}

export async function createPutOptions<TOptions extends CreatePutOptions>(
  pathname: string,
  options?: TOptions,
  extraChecks?: CreatePutMethodOptions<TOptions>['extraChecks'],
  getToken?: CreatePutMethodOptions<TOptions>['getToken'],
): Promise<TOptions> {
  if (!pathname) {
    throw new BlobError('pathname is required');
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

  if (getToken) {
    options.token = await getToken(pathname, options);
  }

  return options;
}
