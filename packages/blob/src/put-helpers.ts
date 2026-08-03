import type { Readable } from 'stream';
// We use the undici types to ensure TS doesn't complain about native types (like ReadableStream) vs
// undici types fetch expects (like Blob is from node:buffer..)
// import type { Blob } from 'node:buffer';
import type { File } from 'undici';
import { MAXIMUM_PATHNAME_LENGTH } from './api';
import type { ClientCommonCreateBlobOptions } from './client';
import type { CommonCreateBlobOptions, PresignedUrlPayload } from './helpers';
import { BlobError, disallowedPathnameCharacters } from './helpers';

/**
 * Options to optimize an image through Vercel Image Optimization before
 * storing it. Requires OIDC authentication.
 */
export interface OptimizeImageOptions {
  /**
   * The desired width of the optimized image in pixels (1-3840).
   */
  width: number;
  /**
   * The desired quality of the optimized image (1-100).
   * @defaultvalue 75
   */
  quality?: number;
  /**
   * The desired output format. The original format is preserved when omitted.
   */
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
}

const optimizeImageFormatToMimeType = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
} as const;

// Mirrors the server-side limits so invalid values fail fast, before paying
// for an upload (and a billable transformation) the API would reject.
export function validateOptimizeImageOptions(
  optimizeImage: OptimizeImageOptions,
): void {
  if (typeof optimizeImage !== 'object' || optimizeImage === null) {
    throw new BlobError('optimizeImage must be an object, see usage');
  }

  const { width, quality, format } = optimizeImage;

  if (!Number.isInteger(width) || width < 1 || width > 3840) {
    throw new BlobError(
      'optimizeImage.width must be an integer between 1 and 3840',
    );
  }

  if (
    quality !== undefined &&
    (!Number.isInteger(quality) || quality < 1 || quality > 100)
  ) {
    throw new BlobError(
      'optimizeImage.quality must be an integer between 1 and 100',
    );
  }

  if (format !== undefined && !(format in optimizeImageFormatToMimeType)) {
    throw new BlobError(
      `optimizeImage.format must be one of: ${Object.keys(
        optimizeImageFormatToMimeType,
      ).join(', ')}`,
    );
  }
}

/**
 * Fail fast when the source is clearly not an image; unknown/absent content
 * types are left to the server, which detects the actual format from the bytes.
 */
export function validateOptimizeImageSourceContentType(
  contentType: string | undefined,
): void {
  if (
    contentType &&
    contentType !== 'application/octet-stream' &&
    !contentType.startsWith('image/')
  ) {
    throw new BlobError(
      `optimizeImage requires an image body, but the content type is "${contentType}"`,
    );
  }
}

// Query params for the put-optimized/put-from-url endpoints. Values are
// validated here first; the API owns the authoritative validation.
export function addOptimizeImageParams(
  params: URLSearchParams,
  optimizeImage: OptimizeImageOptions,
): void {
  validateOptimizeImageOptions(optimizeImage);
  params.set('width', String(optimizeImage.width));
  params.set('quality', String(optimizeImage.quality ?? 75));
  if (optimizeImage.format) {
    params.set('format', optimizeImageFormatToMimeType[optimizeImage.format]);
  }
}

export const putOptionHeaderMap = {
  cacheControlMaxAge: 'x-cache-control-max-age',
  addRandomSuffix: 'x-add-random-suffix',
  allowOverwrite: 'x-allow-overwrite',
  contentType: 'x-content-type',
  access: 'x-vercel-blob-access',
  ifMatch: 'x-if-match',
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
  /**
   * The ETag of the blob. Can be used with `ifMatch` for conditional writes.
   */
  etag: string;
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
  getPresignedUrlPayload?: (
    pathname: string,
    options: TOptions,
  ) => Promise<PresignedUrlPayload>;
  extraChecks?: (options: TOptions) => void;
}

export function createPutHeaders<TOptions extends CommonPutCommandOptions>(
  allowedOptions: CreatePutMethodOptions<TOptions>['allowedOptions'],
  options: TOptions,
): Record<string, string> {
  const headers: Record<string, string> = {};

  // access is always required, so always add it to headers
  headers[putOptionHeaderMap.access] = options.access;

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

  // ifMatch implies allowOverwrite — updating a blob by ETag inherently requires
  // overwriting. Throw if the user explicitly contradicts this.
  if (allowedOptions.includes('ifMatch') && options.ifMatch) {
    if (options.allowOverwrite === false) {
      throw new BlobError(
        'ifMatch and allowOverwrite: false are contradictory. ifMatch is used for conditional overwrites, which requires allowOverwrite to be true.',
      );
    }

    headers[putOptionHeaderMap.ifMatch] = options.ifMatch;
    // Implicitly enable allowOverwrite when ifMatch is set and allowOverwrite
    // was not explicitly provided, to prevent the server from sending
    // conflicting If-Match + If-None-Match headers to S3.
    if (
      allowedOptions.includes('allowOverwrite') &&
      options.allowOverwrite === undefined
    ) {
      headers[putOptionHeaderMap.allowOverwrite] = '1';
    }
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

  if (options.access !== 'public' && options.access !== 'private') {
    throw new BlobError(
      'access must be "private" or "public", see https://vercel.com/docs/vercel-blob',
    );
  }

  if (extraChecks) {
    extraChecks(options);
  }

  if (getToken) {
    options.token = await getToken(pathname, options);
  }

  return options;
}
