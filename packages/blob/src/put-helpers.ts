import type { Readable } from 'stream';
// We use the undici types to ensure TS doesn't complain about native types (like ReadableStream) vs
// undici types fetch expects (like Blob is from node:buffer..)
// import type { Blob } from 'node:buffer';
import type { File } from 'undici';
import { MAXIMUM_PATHNAME_LENGTH } from './api';
import type { ClientCommonCreateBlobOptions } from './client';
import type { CommonCreateBlobOptions } from './helpers';
import { BlobError, disallowedPathnameCharacters } from './helpers';

export const putOptionHeaderMap = {
  cacheControlMaxAge: 'x-cache-control-max-age',
  addRandomSuffix: 'x-add-random-suffix',
  allowOverwrite: 'x-allow-overwrite',
  contentType: 'x-content-type',
};

/**
 * Result of a successful put or copy operation.
 */
export interface PutBlobResult {
  /**
   * The URL of the blob.
   */
  url: string;
  /**
   * A URL that will cause browsers to download the file instead of displaying it inline.
   */
  downloadUrl: string;
  /**
   * The pathname of the blob within the store.
   */
  pathname: string;
  /**
   * The content-type of the blob.
   */
  contentType: string;
  /**
   * The content disposition header value.
   */
  contentDisposition: string;
}

export type PutBlobApiResponse = PutBlobResult;

/**
 * Represents the body content for a put operation.
 * Can be one of several supported types.
 */
export type PutBody =
  | string
  | Readable // Node.js streams
  | Buffer // Node.js buffers
  | Blob
  | ArrayBuffer
  | ReadableStream // Streams API (= Web streams in Node.js)
  | File;

export type CommonPutCommandOptions = CommonCreateBlobOptions &
  ClientCommonCreateBlobOptions;

export interface CreatePutMethodOptions<TOptions> {
  allowedOptions: (keyof typeof putOptionHeaderMap)[];
  getToken?: (pathname: string, options: TOptions) => Promise<string>;
  extraChecks?: (options: TOptions) => void;
}

export function createPutHeaders<TOptions extends CommonPutCommandOptions>(
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
    allowedOptions.includes('allowOverwrite') &&
    options.allowOverwrite !== undefined
  ) {
    headers[putOptionHeaderMap.allowOverwrite] = options.allowOverwrite
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

export async function createPutOptions<
  TOptions extends CommonPutCommandOptions,
>({
  pathname,
  options,
  extraChecks,
  getToken,
}: {
  pathname: string;
  options?: TOptions;
  extraChecks?: CreatePutMethodOptions<TOptions>['extraChecks'];
  getToken?: CreatePutMethodOptions<TOptions>['getToken'];
}): Promise<TOptions> {
  if (!pathname) {
    throw new BlobError('pathname is required');
  }

  if (pathname.length > MAXIMUM_PATHNAME_LENGTH) {
    throw new BlobError(
      `pathname is too long, maximum length is ${MAXIMUM_PATHNAME_LENGTH}`,
    );
  }

  for (const invalidCharacter of disallowedPathnameCharacters) {
    if (pathname.includes(invalidCharacter)) {
      throw new BlobError(
        `pathname cannot contain "${invalidCharacter}", please encode it if needed`,
      );
    }
  }

  if (!options) {
    throw new BlobError('missing options, see usage');
  }

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
