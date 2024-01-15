import { requestApi } from './api';
import type { CreateBlobCommandOptions } from './helpers';
import { BlobError } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-empty-interface -- expose option interface for each API method for better extensibility in the future
export interface CopyCommandOptions extends CreateBlobCommandOptions {}

export interface CopyBlobResult {
  url: string;
  pathname: string;
  contentType?: string;
  contentDisposition: string;
}

/**
 * Copies a blob to another location in your store.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#copy-a-blob
 *
 * @param fromUrl - The blob URL to copy. You can only copy blobs that are in the store, that your 'BLOB_READ_WRITE_TOKEN' has access to.
 * @param toPathname - The pathname to copy the blob to. This includes the filename.
 * @param options - Additional options. The copy method will not preserve any metadata configuration (e.g.: 'cacheControlMaxAge') of the source blob. If you want to copy the metadata, you need to define it here again.
 */
export async function copy(
  fromUrl: string,
  toPathname: string,
  options: CopyCommandOptions,
): Promise<CopyBlobResult> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
  if (!options) {
    throw new BlobError('missing options, see usage');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
  if (options.access !== 'public') {
    throw new BlobError('access must be "public"');
  }

  const headers: Record<string, string> = {};

  if (options.addRandomSuffix !== undefined) {
    headers['x-add-random-suffix'] = options.addRandomSuffix ? '1' : '0';
  }

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  if (options.cacheControlMaxAge !== undefined) {
    headers['x-cache-control-max-age'] = options.cacheControlMaxAge.toString();
  }

  return requestApi<CopyBlobResult>(
    `/${toPathname}?fromUrl=${fromUrl}`,
    { method: 'PUT', headers },
    options,
  );
}
