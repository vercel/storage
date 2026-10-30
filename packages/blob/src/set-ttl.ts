import { requestApi } from './api';
import type { BlobCommandOptions } from './helpers';

export interface SetTtlCommandOptions extends BlobCommandOptions {
  /**
   * Days (1-730) until the blob is deleted, or `null` to remove an existing TTL.
   * S3 counts from the blob's upload date, not from this call.
   */
  ttlDays: number | null;
}

export interface SetTtlResult {
  url: string;
  pathname: string;
  ttlDays: number | null;
}

/**
 * Changes or clears a blob's TTL in place, without re-uploading it.
 *
 * @param urlOrPathname - Blob url or pathname.
 * @param options - `ttlDays` plus the usual auth options.
 */
export async function setTtl(
  urlOrPathname: string,
  options: SetTtlCommandOptions,
): Promise<SetTtlResult> {
  return requestApi<SetTtlResult>(
    '/set-ttl',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: urlOrPathname, ttlDays: options.ttlDays }),
      signal: options.abortSignal,
    },
    options,
  );
}
