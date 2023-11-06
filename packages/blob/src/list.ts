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

interface ListBaseCommandOptions extends BlobCommandOptions {
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
}

export interface ListCommandOptions extends ListBaseCommandOptions {
  /**
   * Defines how the blobs are listed
   * - `expanded` the blobs response property contains all blobs.
   * - `folded` the blobs response property contains only the blobs at the root level of the store. Blobs that are located inside a folder get merged into a single entry in the folder response property.
   * @defaultvalue 'expanded'
   */
  mode?: 'expanded';
}

export interface ListFoldedCommandOptions extends ListBaseCommandOptions {
  /**
   * Defines how the blobs are listed
   * - `expanded` the blobs response property contains all blobs.
   * - `folded` the blobs response property contains only the blobs at the root level of the store. Blobs that are located inside a folder get merged into a single entry in the folder response property.
   * @defaultvalue 'expanded'
   */
  mode: 'folded';
}

export async function list(): Promise<ListBlobResult>;
export async function list<
  T extends ListCommandOptions | ListFoldedCommandOptions,
>(
  options: T,
): Promise<
  T extends ListFoldedCommandOptions ? ListFoldedBlobResult : ListBlobResult
>;
export async function list(
  options?: ListCommandOptions | ListFoldedCommandOptions,
): Promise<ListFoldedBlobResult | ListBlobResult> {
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
  } as ListFoldedBlobResult | ListBlobResult;
}

function mapBlobResult(
  blobResult: ListBlobApiResponseBlob,
): ListBlobResultBlob {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}
