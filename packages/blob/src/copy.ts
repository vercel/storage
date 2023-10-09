import { fetch } from 'undici';
import type { BlobCommandOptions } from './helpers';
import {
  BlobError,
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
  validateBlobApiResponse,
} from './helpers';

export interface CopyCommandOptions extends BlobCommandOptions {
  access: 'public';
  addRandomSuffix?: boolean;
  contentType?: string;
  cacheControlMaxAge?: number;
}

export interface CopyBlobResult {
  url: string;
  pathname: string;
  contentType?: string;
  contentDisposition: string;
}

/**
 * Copy blob to another location in your store.
 * @param fromUrl - The blob URL to copy. You can only copy blobs that are in the store, that your 'BLOB_READ_WRITE_TOKEN' has access to.
 * @param toPathname - The pathname to copy the blob to. This includes the filename.
 * @param options - Additional options. The copy method will not preserve any metadata configuration (e.g.: 'cacheControlMaxAge') of the source blob. If you want to copy the metadata, you need to define it here again.
 */
export async function copy(
  fromUrl: string,
  toPathname: string,
  options: CopyCommandOptions
): Promise<CopyBlobResult> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
  if (!options) {
    throw new BlobError('missing options, see usage');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
  if (options.access !== 'public') {
    throw new BlobError('access must be "public"');
  }

  const headers: Record<string, string> = {
    ...getApiVersionHeader(),
    authorization: `Bearer ${getTokenFromOptionsOrEnv(options)}`,
  };

  if (options.addRandomSuffix !== undefined) {
    headers['x-add-random-suffix'] = options.addRandomSuffix ? '1' : '0';
  }

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  if (options.cacheControlMaxAge !== undefined) {
    headers['x-cache-control-max-age'] = options.cacheControlMaxAge.toString();
  }

  const blobApiResponse = await fetch(
    getApiUrl(`/${toPathname}?fromUrl=${fromUrl}`),
    { method: 'PUT', headers }
  );

  await validateBlobApiResponse(blobApiResponse);

  return (await blobApiResponse.json()) as CopyBlobResult;
}
