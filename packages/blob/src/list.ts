import { fetch } from 'undici';
import type { BlobCommandOptions } from './helpers';
import {
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
  validateBlobApiResponse,
} from './helpers';

export interface ListBlobResultBlob {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export interface ExpandedListBlobResult {
  blobs: ListBlobResultBlob[];
  cursor?: string;
  hasMore: boolean;
}

export interface FoldedListBlobResult extends ExpandedListBlobResult {
  folders?: string[];
}

export type ListBlobResult<M extends ListCommandOptionsMode = 'expanded'> =
  M extends 'folded' ? FoldedListBlobResult : ExpandedListBlobResult;

interface ListBlobApiResponseBlob
  extends Omit<ListBlobResultBlob, 'uploadedAt'> {
  uploadedAt: string;
}

interface ListBlobApiResponse extends Omit<ListBlobResult, 'blobs'> {
  blobs: ListBlobApiResponseBlob[];
  folders?: string[];
}

type ListCommandOptionsMode = 'expanded' | 'folded';

export interface ListCommandOptions<M extends ListCommandOptionsMode>
  extends BlobCommandOptions {
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
   * - `expanded` the blobs response property contains all blobs.
   * - `folded` the blobs response property contains only the blobs at the root level of the store. Blobs that are located inside a folder get merged into a single entry in the folder response property.
   * @defaultvalue 'expanded'
   */
  mode?: M;
}

/**
 * Fetches a paginated list of blob objects from your store.
 * Detailed documentation can be found here: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk#list-blobs
 *
 * @param options - Additional options for the request.
 */
export async function list<M extends ListCommandOptionsMode = 'expanded'>(
  options?: ListCommandOptions<M>,
): Promise<ListBlobResult<M>> {
  const listApiUrl = new URL(getApiUrl());
  if (options?.limit) {
    listApiUrl.searchParams.set('limit', options.limit.toString());
  }
  if (options?.prefix) {
    listApiUrl.searchParams.set('prefix', options.prefix);
  }
  if (options?.cursor) {
    listApiUrl.searchParams.set('cursor', options.cursor);
  }
  if (options?.mode) {
    listApiUrl.searchParams.set('mode', options.mode);
  }

  const blobApiResponse = await fetch(listApiUrl, {
    method: 'GET',
    headers: {
      ...getApiVersionHeader(),
      authorization: `Bearer ${getTokenFromOptionsOrEnv(options)}`,
    },
  });

  await validateBlobApiResponse(blobApiResponse);

  const results = (await blobApiResponse.json()) as ListBlobApiResponse;

  return {
    folders: results.folders,
    cursor: results.cursor,
    hasMore: results.hasMore,
    blobs: results.blobs.map(mapBlobResult),
  } as ListBlobResult<M>;
}

function mapBlobResult(
  blobResult: ListBlobApiResponseBlob,
): ListBlobResultBlob {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}
