import { debug } from '../debug';
import { computeBodyLength } from '../helpers';
import type { WithUploadProgress, BlobCommandOptions } from '../helpers';
import type { PutBody, PutBlobResult } from '../put-helpers';
import { completeMultipartUpload } from './complete';
import { createMultipartUpload } from './create';
import { toReadableStream } from './helpers';
import { uploadAllParts } from './upload';

// this automatically slices the body into parts and uploads all of them as multiple parts
export async function uncontrolledMultipartUpload(
  pathname: string,
  body: PutBody,
  headers: Record<string, string>,
  options: BlobCommandOptions & WithUploadProgress,
): Promise<PutBlobResult> {
  debug('mpu: init', 'pathname:', pathname, 'headers:', headers);

  const optionsWithoutOnUploadProgress = {
    ...options,
    onUploadProgress: undefined,
  };

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
