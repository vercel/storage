import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';

export interface ListBlobResultBlob {
  url: string;
  downloadUrl: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export interface ListBlobResult {
  blobs: ListBlobResultBlob[];
  cursor?: string;
  hasMore: boolean;
}

export interface ListFoldedBlobResult extends ListBlobResult {
  folders: string[];
}

interface ListBlobApiResponseBlob
  extends Omit<ListBlobResultBlob, 'uploadedAt'> {
  uploadedAt: string;
}

interface ListBlobApiResponse extends Omit<ListBlobResult, 'blobs'> {
  blobs: ListBlobApiResponseBlob[];
  folders?: string[];
}

export interface ListCommandOptions<
  M extends 'expanded' | 'folded' | undefined = undefined,
> extends BlobCommandOptions {
  /**
   * The maximum number of blobs to return.
   * @defaultvalue 1000
   */
  limit?: number;
  /**
   * Filters the result to only include blobs that start with this prefix.
   * If used together with `mode: 'folded'`, make sure to include a trailing slash after the foldername.
   */
  prefix?: string;
  /**
   * The cursor to use for pagination. Can be obtained from the response of a previous `list` request.
   */
  cursor?: string;
  /**
   * Defines how the blobs are listed
   * - `expanded` the blobs property contains all blobs.
   * - `folded` the blobs property contains only the blobs at the root level of your store. Blobs that are located inside a folder get merged into a single entry in the folder response property.
   * @defaultvalue 'expanded'
   */
  mode?: M;
}

type ListCommandResult<
  M extends 'expanded' | 'folded' | undefined = undefined,
> = M extends 'folded' ? ListFoldedBlobResult : ListBlobResult;

/**
 * Fetches a paginated list of blob objects from your store.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#list-blobs
 *
 * @param options - Additional options for the request.
 */
export async function list<
  M extends 'expanded' | 'folded' | undefined = undefined,
>(options?: ListCommandOptions<M>): Promise<ListCommandResult<M>> {
  const searchParams = new URLSearchParams();

  if (options?.limit) {
    searchParams.set('limit', options.limit.toString());
  }
  if (options?.prefix) {
    searchParams.set('prefix', options.prefix);
  }
  if (options?.cursor) {
    searchParams.set('cursor', options.cursor);
  }
  if (options?.mode) {
    searchParams.set('mode', options.mode);
  }

  const response = await requestApi<ListBlobApiResponse>(
    `?${searchParams.toString()}`,
    {
      method: 'GET',
      signal: options?.abortSignal,
    },
    options,
  );

  if (options?.mode === 'folded') {
    return {
      folders: response.folders ?? [],
      cursor: response.cursor,
      hasMore: response.hasMore,
      blobs: response.blobs.map(mapBlobResult),
    } as ListCommandResult<M>;
  }

  return {
    cursor: response.cursor,
    hasMore: response.hasMore,
    blobs: response.blobs.map(mapBlobResult),
  } as ListCommandResult<M>;
}

function mapBlobResult(
  blobResult: ListBlobApiResponseBlob,
): ListBlobResultBlob {
  return {
    url: blobResult.url,
    downloadUrl: blobResult.downloadUrl,
    pathname: blobResult.pathname,
    size: blobResult.size,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}
