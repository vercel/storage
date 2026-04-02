import { debug } from '../debug';
import type { CommonCreateBlobOptions, WithUploadProgress } from '../helpers';
import { BlobError, computeBodyLength, isStream } from '../helpers';
import type { PutBlobResult, PutBody } from '../put-helpers';
import { completeMultipartUpload } from './complete';
import { createMultipartUpload } from './create';
import { toReadableStream } from './helpers';
import { uploadAllParts } from './upload';

// this automatically slices the body into parts and uploads all of them as multiple parts
export async function uncontrolledMultipartUpload(
  pathname: string,
  body: PutBody,
  headers: Record<string, string>,
  options: CommonCreateBlobOptions & WithUploadProgress,
): Promise<PutBlobResult> {
  debug('mpu: init', 'pathname:', pathname, 'headers:', headers);

  const optionsWithoutOnUploadProgress = {
    ...options,
    onUploadProgress: undefined,
  };

  // For bodies with a known size (Blob, File, Buffer, etc.) enforce
  // maximumSizeInBytes client-side before starting the upload. This avoids
  // creating a multipart upload that will ultimately fail.
  // Streams are skipped because their size is unknown upfront.
  if (
    options.maximumSizeInBytes !== undefined &&
    !isStream(body) &&
    computeBodyLength(body) > options.maximumSizeInBytes
  ) {
    throw new BlobError(
      `Body size of ${computeBodyLength(body)} bytes exceeds the maximum allowed size of ${options.maximumSizeInBytes} bytes`,
    );
  }

  // Step 1: Start multipart upload
  const createMultipartUploadResponse = await createMultipartUpload(
    pathname,
    headers,
    optionsWithoutOnUploadProgress,
  );

  const totalToLoad = computeBodyLength(body);
  const stream = await toReadableStream(body);

  // Step 2: Upload parts one by one
  const parts = await uploadAllParts({
    uploadId: createMultipartUploadResponse.uploadId,
    key: createMultipartUploadResponse.key,
    pathname,
    // @ts-expect-error ReadableStream<ArrayBuffer | Uint8Array> is compatible at runtime
    stream,
    headers,
    options,
    totalToLoad,
  });

  // Step 3: Complete multipart upload
  const blob = await completeMultipartUpload({
    uploadId: createMultipartUploadResponse.uploadId,
    key: createMultipartUploadResponse.key,
    pathname,
    parts,
    headers,
    options: optionsWithoutOnUploadProgress,
  });

  // changes:
  // stream => set percentage to 0% even if loaded/total is valid
  // stream => send onUploadProgress 100% at the end of the request here

  return blob;
}
