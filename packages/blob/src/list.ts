import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';

/**
 * Basic blob object information returned by the list method.
 */
export interface ListBlobResultBlob {
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
   * The size of the blob in bytes.
   */
  size: number;

  /**
   * The date when the blob was uploaded.
   */
  uploadedAt: Date;

  /**
   * The ETag of the blob. Can be used with `ifMatch` for conditional writes.
   */
  etag?: string;
}

/**
 * Result of the list method in expanded mode (default).
 */
export interface ListBlobResult {
  /**
   * Array of blob objects in the store.
   */
  blobs: ListBlobResultBlob[];

  /**
   * Pagination cursor for the next set of results, if hasMore is true.
   */
  cursor?: string;

  /**
   * Indicates if there are more results available.
   */
  hasMore: boolean;
}

/**
 * Result of the list method in folded mode.
 */
export interface ListFoldedBlobResult extends ListBlobResult {
  /**
   * Array of folder paths in the store.
   */
  folders: string[];
}

/**
 * @internal Internal interface for the API response blob structure.
 * Maps the API response format where uploadedAt is a string, not a Date.
 */
interface ListBlobApiResponseBlob
  extends Omit<ListBlobResultBlob, 'uploadedAt' | 'etag'> {
  uploadedAt: string;
  etag?: string;
}

/**
 * @internal Internal interface for the API response structure.
 */
interface ListBlobApiResponse extends Omit<ListBlobResult, 'blobs'> {
  blobs: ListBlobApiResponseBlob[];
  folders?: string[];
}

/**
 * Options for the list method.
 */
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

/**
 * @internal Type helper to determine the return type based on the mode parameter.
 */
type ListCommandResult<
  M extends 'expanded' | 'folded' | undefined = undefined,
> = M extends 'folded' ? ListFoldedBlobResult : ListBlobResult;

/**
 * Fetches a paginated list of blob objects from your store.
 *
 * @param options - Configuration options including:
 *   - token - (Optional) A string specifying the read-write token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - limit - (Optional) The maximum number of blobs to return. Defaults to 1000.
 *   - prefix - (Optional) Filters the result to only include blobs that start with this prefix. If used with mode: 'folded', include a trailing slash after the folder name.
 *   - cursor - (Optional) The cursor to use for pagination. Can be obtained from the response of a previous list request.
 *   - mode - (Optional) Defines how the blobs are listed. Can be 'expanded' (default) or 'folded'. In folded mode, blobs located inside a folder are merged into a single entry in the folders response property.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to an object containing:
 *   - blobs: An array of blob objects with size, uploadedAt, pathname, url, and downloadUrl properties
 *   - cursor: A string for pagination (if hasMore is true)
 *   - hasMore: A boolean indicating if there are more results available
 *   - folders: (Only in 'folded' mode) An array of folder paths
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

/**
 * @internal Helper function to map API response blob format to the expected return type.
 * Converts the uploadedAt string into a Date object.
 */
function mapBlobResult(
  blobResult: ListBlobApiResponseBlob,
): ListBlobResultBlob {
  return {
    url: blobResult.url,
    downloadUrl: blobResult.downloadUrl,
    pathname: blobResult.pathname,
    size: blobResult.size,
    uploadedAt: new Date(blobResult.uploadedAt),
    // Only include etag if present (API v12+)
    ...(blobResult.etag ? { etag: blobResult.etag } : {}),
  };
}
