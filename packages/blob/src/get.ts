import type { BlobCommandOptions } from './helpers';
import { BlobError, getTokenFromOptionsOrEnv } from './helpers';
import { list } from './list';

/**
 * Options for the get method.
 */
export interface GetCommandOptions extends BlobCommandOptions {
  /**
   * Whether the blob is publicly accessible or private.
   * - 'public': The blob is publicly accessible via its URL.
   * - 'private': The blob requires authentication to access.
   */
  access: 'public' | 'private';
}

/**
 * Result of the get method containing the blob content and metadata.
 */
export interface GetBlobResult {
  /**
   * The blob content as a Blob object.
   */
  blob: Blob;

  /**
   * The URL of the blob.
   */
  url: string;

  /**
   * The pathname of the blob within the store.
   */
  pathname: string;

  /**
   * The content type of the blob.
   */
  contentType: string;

  /**
   * The size of the blob in bytes.
   */
  size: number;
}

/**
 * Checks if the input is a URL (starts with http:// or https://).
 */
function isUrl(urlOrPathname: string): boolean {
  return (
    urlOrPathname.startsWith('http://') || urlOrPathname.startsWith('https://')
  );
}

/**
 * Extracts the pathname from a blob URL.
 */
function extractPathnameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Remove leading slash from pathname
    return parsedUrl.pathname.slice(1);
  } catch {
    return url;
  }
}

/**
 * Fetches blob content by URL or pathname.
 * - If a URL is provided, fetches the blob directly (bypasses list operation).
 * - If a pathname is provided, uses list to find the blob first.
 *
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk
 *
 * @param urlOrPathname - The URL or pathname of the blob to fetch.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Determines the access level of the blob.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to the blob content and metadata, or null if not found.
 */
export async function get(
  urlOrPathname: string,
  options: GetCommandOptions,
): Promise<GetBlobResult | null> {
  if (!urlOrPathname) {
    throw new BlobError('url or pathname is required');
  }

  if (!options) {
    throw new BlobError('missing options, see usage');
  }

  if (options.access !== 'public' && options.access !== 'private') {
    throw new BlobError('access must be "public" or "private"');
  }

  const token = getTokenFromOptionsOrEnv(options);

  let blobUrl: string;
  let pathname: string;
  let size: number | undefined;

  // Check if input is a URL - if so, bypass list operation
  if (isUrl(urlOrPathname)) {
    blobUrl = urlOrPathname;
    pathname = extractPathnameFromUrl(urlOrPathname);
  } else {
    // Use list to find the blob by pathname
    const listResult = await list({
      prefix: urlOrPathname,
      limit: 1,
      token,
      abortSignal: options.abortSignal,
    });

    // Find exact match by pathname
    const blobInfo = listResult.blobs.find(
      (blob) => blob.pathname === urlOrPathname,
    );

    if (!blobInfo) {
      return null;
    }

    blobUrl = blobInfo.url;
    pathname = blobInfo.pathname;
    size = blobInfo.size;
  }

  // Fetch the blob content with authentication headers
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'x-vercel-blob-access': options.access,
  };

  const response = await fetch(blobUrl, {
    method: 'GET',
    headers,
    signal: options.abortSignal,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new BlobError(
      `Failed to fetch blob: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();

  return {
    blob,
    url: blobUrl,
    pathname,
    contentType:
      response.headers.get('content-type') || 'application/octet-stream',
    size: size ?? blob.size,
  };
}
