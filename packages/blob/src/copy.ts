import { MAXIMUM_PATHNAME_LENGTH, requestApi } from './api';
import type { CommonCreateBlobOptions } from './helpers';
import { BlobError, disallowedPathnameCharacters } from './helpers';

export type CopyCommandOptions = CommonCreateBlobOptions;

export interface CopyBlobResult {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
  /**
   * The ETag of the blob. Can be used with `ifMatch` for conditional writes.
   */
  etag?: string;
}

/**
 * Copies a blob to another location in your store.
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk#copy-a-blob
 *
 * @param fromUrlOrPathname - The blob URL (or pathname) to copy. You can only copy blobs that are in the store, that your 'BLOB_READ_WRITE_TOKEN' has access to.
 * @param toPathname - The pathname to copy the blob to. This includes the filename.
 * @param options - Additional options. The copy method will not preserve any metadata configuration (e.g.: 'cacheControlMaxAge') of the source blob. If you want to copy the metadata, you need to define it here again.
 */
export async function copy(
  fromUrlOrPathname: string,
  toPathname: string,
  options: CopyCommandOptions,
): Promise<CopyBlobResult> {
  if (!options) {
    throw new BlobError('missing options, see usage');
  }

  if (options.access !== 'public') {
    throw new BlobError('access must be "public"');
  }

  if (toPathname.length > MAXIMUM_PATHNAME_LENGTH) {
    throw new BlobError(
      `pathname is too long, maximum length is ${MAXIMUM_PATHNAME_LENGTH}`,
    );
  }

  for (const invalidCharacter of disallowedPathnameCharacters) {
    if (toPathname.includes(invalidCharacter)) {
      throw new BlobError(
        `pathname cannot contain "${invalidCharacter}", please encode it if needed`,
      );
    }
  }

  const headers: Record<string, string> = {};

  if (options.addRandomSuffix !== undefined) {
    headers['x-add-random-suffix'] = options.addRandomSuffix ? '1' : '0';
  }

  if (options.allowOverwrite !== undefined) {
    headers['x-allow-overwrite'] = options.allowOverwrite ? '1' : '0';
  }

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  if (options.cacheControlMaxAge !== undefined) {
    headers['x-cache-control-max-age'] = options.cacheControlMaxAge.toString();
  }

  if (options.ifMatch) {
    headers['x-if-match'] = options.ifMatch;
  }

  const params = new URLSearchParams({
    pathname: toPathname,
    fromUrl: fromUrlOrPathname,
  });

  const response = await requestApi<CopyBlobResult>(
    `?${params.toString()}`,
    {
      method: 'PUT',
      headers,
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
    etag: response.etag,
  };
}
