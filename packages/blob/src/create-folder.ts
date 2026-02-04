import { requestApi } from './api';
import type { CommonCreateBlobOptions } from './helpers';
import { BlobError } from './helpers';
import { type PutBlobApiResponse, putOptionHeaderMap } from './put-helpers';

export type CreateFolderCommandOptions = Pick<
  CommonCreateBlobOptions,
  'access' | 'token' | 'abortSignal'
>;

export interface CreateFolderResult {
  pathname: string;
  url: string;
}

/**
 * Creates a folder in your store. Vercel Blob has no real concept of folders, our file browser on Vercel.com displays folders based on the presence of trailing slashes in the pathname. Unless you are building a file browser system, you probably don't need to use this method.
 *
 * Use the resulting `url` to delete the folder, just like you would delete a blob.
 * @param pathname - Can be user1/ or user1/avatars/
 * @param options - Additional options including required `access` ('public' or 'private') and optional `token`
 */
export async function createFolder(
  pathname: string,
  options: CreateFolderCommandOptions,
): Promise<CreateFolderResult> {
  if (!options) {
    throw new BlobError('missing options, see usage');
  }

  if (options.access !== 'public' && options.access !== 'private') {
    throw new BlobError(
      'access must be "private" or "public", see https://vercel.com/docs/vercel-blob',
    );
  }

  const folderPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;

  const headers: Record<string, string> = {};

  headers[putOptionHeaderMap.access] = options.access;
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
