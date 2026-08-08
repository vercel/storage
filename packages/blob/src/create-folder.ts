import { requestApi } from './api';
import type { BlobAccessType, BlobCommandOptions } from './helpers';
import { type PutBlobApiResponse, putOptionHeaderMap } from './put-helpers';

export interface CreateFolderCommandOptions extends BlobCommandOptions {
  /** @defaultValue 'public' — kept for backward compatibility */
  access?: BlobAccessType;
}

export interface CreateFolderResult {
  pathname: string;
  url: string;
}

/**
 * Creates a folder in your store. Vercel Blob has no real concept of folders, our file browser on Vercel.com displays folders based on the presence of trailing slashes in the pathname. Unless you are building a file browser system, you probably don't need to use this method.
 *
 * Use the resulting `url` to delete the folder, just like you would delete a blob.
 * @param pathname - Can be user1/ or user1/avatars/
 * @param options - Configuration options including:
 *   - access - (Optional) Must be 'public' or 'private'. Determines the access level of the folder. Defaults to 'public' for backward compatibility.
 *   - token - (Optional) Read-write token when not using Vercel OIDC token for authentication, or set `BLOB_READ_WRITE_TOKEN`.
 *   - oidcToken - (Optional) Vercel OIDC token for authentication with `storeId` (or `BLOB_STORE_ID`); overrides `VERCEL_OIDC_TOKEN`.
 *   - storeId - (Optional) Store id when using Vercel OIDC token for authentication; overrides `BLOB_STORE_ID`.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 */
// access defaults to 'public' for backward compatibility with callers
// that don't pass options (pre-private-storage API)
export async function createFolder(
  pathname: string,
  options: CreateFolderCommandOptions = { access: 'public' },
): Promise<CreateFolderResult> {
  const access = options.access ?? 'public';

  const folderPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;

  const headers: Record<string, string> = {};

  headers[putOptionHeaderMap.access] = access;
  headers[putOptionHeaderMap.addRandomSuffix] = '0';

  const params = new URLSearchParams({ pathname: folderPathname });
  const response = await requestApi<PutBlobApiResponse>(
    `/?${params.toString()}`,
    {
      method: 'PUT',
      headers,
      signal: options.abortSignal,
    },
    options,
  );

  return {
    url: response.url,
    pathname: response.pathname,
  };
}
