import { debug } from '../debug';
import type { BlobCommandOptions } from '../helpers';
import type { PutBody, PutBlobResult } from '../put-helpers';
import { completeMultiPartUpload } from './complete';
import { createMultiPartUpload } from './create';
import { toReadableStream } from './helpers';
import { uploadAllParts } from './upload';

// this automatically slices the body into parts and uploads all of them as multiple part
export async function automaticMultipartPut(
  pathname: string,
  body: PutBody,
  headers: Record<string, string>,
  options: BlobCommandOptions,
): Promise<PutBlobResult> {
  debug('mpu: init', 'pathname:', pathname, 'headers:', headers);

  const stream = toReadableStream(body);

  // Step 1: Start multipart upload
  const createMultipartUploadResponse = await createMultiPartUpload(
    pathname,
    headers,
    options,
  );

  // Step 2: Upload parts one by one
  const parts = await uploadAllParts(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    pathname,
    stream,
    headers,
    options,
  );

  // Step 3: Complete multipart upload
  const blob = await completeMultiPartUpload(
    createMultipartUploadResponse.uploadId,
    createMultipartUploadResponse.key,
    pathname,
    parts,
    headers,
    options,
  );

  return blob;
}
