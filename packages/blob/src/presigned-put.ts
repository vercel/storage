import throttle from 'throttleit';
import type { Response } from 'undici';
import { BlobRequestAbortedError, getBlobError } from './api';
import type { BlobAccessType, WithUploadProgress } from './helpers';
import { BlobError, computeBodyLength, isPlainObject } from './helpers';
import {
  type CommonPutCommandOptions,
  createPutHeaders,
  type PutBlobApiResponse,
  type PutBody,
} from './put-helpers';
import { blobRequest } from './request';
import {
  controlPlaneBlobPutUrl,
  type IssuedSignedToken,
  presignUrl,
} from './signed-token';

function shouldUseXContentLength(): boolean {
  try {
    return process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH === '1';
  } catch {
    return false;
  }
}

/**
 * Options for a presigned upload: same transport headers as a normal client
 * {@link put} (e.g. `x-vercel-blob-access`, `x-content-type`), but authentication
 * is the presigned query string, not a bearer client token.
 */
export type PresignedPutWithIssuedTokenOptions = WithUploadProgress & {
  access: BlobAccessType;
  /** Material from {@link issueSignedToken} (must include `"put"` in `operations` on the control plane). */
  signedToken: IssuedSignedToken;
  contentType?: string;
  abortSignal?: AbortSignal;
};

/**
 * `PUT` to the same control-API URL as `put()` and {@link controlPlaneBlobPutUrl}
 * (`?pathname=…` on the blob API). HMAC and query match {@link presignUrl} with
 * `method: 'PUT'`, not a `*.blob.vercel-storage.com` read URL. Does **not** send
 * `Authorization: Bearer`.
 *
 * Also exported as `uploadWithSignedToken` from `@vercel/blob/client`.
 */
export async function putWithIssuedSignedToken(
  pathname: string,
  body: PutBody,
  options: PresignedPutWithIssuedTokenOptions,
): Promise<PutBlobApiResponse> {
  if (!body) {
    throw new BlobError('body is required');
  }

  if (isPlainObject(body)) {
    throw new BlobError(
      "Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload.",
    );
  }

  if (!options.signedToken) {
    throw new BlobError('`signedToken` is required');
  }

  const { signedToken, access, abortSignal } = options;
  const headerInput = {
    access,
    contentType: options.contentType,
  } as CommonPutCommandOptions;

  const headers = createPutHeaders(['contentType'], headerInput);

  const putUrl = controlPlaneBlobPutUrl(pathname);
  const presigned = await presignUrl(putUrl, signedToken, 'PUT');

  const onProgress = options.onUploadProgress
    ? throttle(options.onUploadProgress, 100)
    : undefined;
  const bodyLength = computeBodyLength(body);
  const sendBodyLength = onProgress || shouldUseXContentLength();
  if (onProgress) {
    onProgress({ loaded: 0, total: bodyLength, percentage: 0 });
  }

  let res: Response;
  try {
    res = await blobRequest({
      input: presigned,
      init: {
        method: 'PUT',
        body,
        headers: {
          ...headers,
          ...(sendBodyLength ? { 'x-content-length': String(bodyLength) } : {}),
        },
        signal: abortSignal,
      },
      onUploadProgress: onProgress
        ? (loaded) => {
            const total = bodyLength !== 0 ? bodyLength : loaded;
            const percentage =
              bodyLength > 0 ? Number(((loaded / total) * 100).toFixed(2)) : 0;
            if (percentage === 100 && bodyLength > 0) {
              return;
            }
            onProgress({ loaded, total, percentage });
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new BlobRequestAbortedError();
    }
    throw error;
  }

  if (!res.ok) {
    const { error } = await getBlobError(res);
    throw error;
  }

  if (onProgress) {
    onProgress({ loaded: bodyLength, total: bodyLength, percentage: 100 });
  }

  return (await res.json()) as PutBlobApiResponse;
}
