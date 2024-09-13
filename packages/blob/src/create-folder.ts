import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';
import { putOptionHeaderMap, type PutBlobApiResponse } from './put-helpers';

export interface CreateFolderResult {
  pathname: string;
  /**
   * URL of created folder. There is not content at this URL.
   * Use this URL to delete the folder, just like you would delete a file.
   */
  url: string;
}

/**
 * Creates a folder in your store. Vercel Blob has no real concept of folders, our file browser on Vercel.com displays folders based on the presence of trailing slashes in the pathname. Unless you are building a file browser system, you probably don't need to use this method.
 * @param pathname - Can be user1/ or user1/avatars/
 * @param options - Additional options like `token`
 * @returns
 */
export async function createFolder(
  pathname: string,
  options: BlobCommandOptions = {},
): Promise<CreateFolderResult> {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;

  const headers: Record<string, string> = {};

  headers[putOptionHeaderMap.addRandomSuffix] = '0';

  const response = await requestApi<PutBlobApiResponse>(
    `/${path}`,
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
