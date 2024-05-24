import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';
import { putOptionHeaderMap, type PutBlobApiResponse } from './put-helpers';

export interface CreateFolderCommandOptions extends BlobCommandOptions {
  /**
   * Adds a random suffix to the filename.
   * @defaultvalue true
   */
  addRandomSuffix?: boolean;
}

export interface CreateFolderResult {
  pathname: string;
  /**
   * URL of created folder. There is not content at this URL.
   * It can be used to delete the folder.
   */
  url: string;
  prefix: string;
}

export async function createFolder(
  pathname: string,
  options: CreateFolderCommandOptions = {},
): Promise<CreateFolderResult> {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;

  const headers: Record<string, string> = {};

  if (options.addRandomSuffix !== undefined) {
    headers[putOptionHeaderMap.addRandomSuffix] = options.addRandomSuffix
      ? '1'
      : '0';
  }

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
    prefix: new URL(response.url).pathname,
  };
}
