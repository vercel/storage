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

export interface SetTtlFailure {
  url: string;
  pathname: string;
  error: { code: 'not_found'; message: string };
}

export type SetTtlBatchResult = SetTtlResult | SetTtlFailure;

/**
 * Changes or clears a blob's TTL in place, without re-uploading it.
 *
 * @param urlOrPathname - Blob url or pathname.
 * @param options - `ttlDays` plus the usual auth options.
 */
export async function setTtl(
  urlOrPathname: string,
  options: SetTtlCommandOptions,
): Promise<SetTtlResult>;
/**
 * Changes or clears the TTL of up to 1,000 blobs in one request. Blobs that
 * don't exist come back as `{ error: { code: 'not_found' } }` entries instead
 * of failing the whole batch.
 *
 * @param urlsOrPathnames - Blob urls or pathnames.
 * @param options - `ttlDays` plus the usual auth options.
 */
export async function setTtl(
  urlsOrPathnames: string[],
  options: SetTtlCommandOptions,
): Promise<SetTtlBatchResult[]>;
export async function setTtl(
  urlOrPathname: string | string[],
  options: SetTtlCommandOptions,
): Promise<SetTtlResult | SetTtlBatchResult[]> {
  const body = Array.isArray(urlOrPathname)
    ? { urls: urlOrPathname, ttlDays: options.ttlDays }
    : { url: urlOrPathname, ttlDays: options.ttlDays };

  return requestApi<SetTtlResult | SetTtlBatchResult[]>(
    '/set-ttl',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    },
    options,
  );
}
