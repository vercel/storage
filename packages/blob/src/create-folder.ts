import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';
import { putOptionHeaderMap, type PutBlobApiResponse } from './put-helpers';

export interface CreateFolderResult {
  pathname: string;
  url: string;
}

/**
 * Creates a folder in your store. Vercel Blob has no real concept of folders, our file browser on Vercel.com displays folders based on the presence of trailing slashes in the pathname. Unless you are building a file browser system, you probably don't need to use this method.
 *
 * Use the resulting `url` to delete the folder, just like you would delete a blob.
 * @param pathname - Can be user1/ or user1/avatars/
 * @param options - Additional options like `token`
 */
export async function createFolder(
  pathname: string,
  options: BlobCommandOptions = {},
): Promise<CreateFolderResult> {
  const folderPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;

  const headers: Record<string, string> = {};

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
