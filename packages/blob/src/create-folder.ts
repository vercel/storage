import { requestApi } from './api';
import type { BlobAccessType, CommonCreateBlobOptions } from './helpers';
import { BlobError } from './helpers';
import { type PutBlobApiResponse, putOptionHeaderMap } from './put-helpers';

export type CreateFolderCommandOptions = Pick<
  CommonCreateBlobOptions,
  'token' | 'abortSignal'
> & {
  /** @defaultValue 'public' — kept for backward compatibility */
  access?: BlobAccessType;
};

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
