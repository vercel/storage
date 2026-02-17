import type { CommonCreateBlobOptions } from './helpers';
import type { CompleteMultipartUploadCommandOptions } from './multipart/complete';
import { createCompleteMultipartUploadMethod } from './multipart/complete';
import { createCreateMultipartUploadMethod } from './multipart/create';
import { createCreateMultipartUploaderMethod } from './multipart/create-uploader';
import type { UploadPartCommandOptions } from './multipart/upload';
import { createUploadPartMethod } from './multipart/upload';
import type { PutCommandOptions } from './put';
import { createPutMethod } from './put';

// expose api BlobErrors
export {
  BlobAccessError,
  BlobClientTokenExpiredError,
  BlobContentTypeNotAllowedError,
  BlobFileTooLargeError,
  BlobNotFoundError,
  BlobPathnameMismatchError,
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
} from './api';
// expose generic BlobError and download url util
export {
  type BlobAccessType,
  BlobError,
  getDownloadUrl,
  type OnUploadProgressCallback,
  type UploadProgressEvent,
} from './helpers';

// vercelBlob.put()

export type { PutBlobResult } from './put-helpers';
export type { PutCommandOptions };

/**
 * Uploads a blob into your store from your server.
 * Detailed documentation can be found here: https://vercel.com/docs/vercel-blob/using-blob-sdk#upload-a-blob
 *
 * If you want to upload from the browser directly, or if you're hitting Vercel upload limits, check out the documentation for client uploads: https://vercel.com/docs/vercel-blob/using-blob-sdk#client-uploads
 *
 * @param pathname - The pathname to upload the blob to, including the extension. This will influence the URL of your blob like https://$storeId.public.blob.vercel-storage.com/$pathname.
 * @param body - The content of your blob, can be a: string, File, Blob, Buffer or Stream. We support almost everything fetch supports: https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#body.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Public blobs are accessible via URL, private blobs require authentication.
 *   - addRandomSuffix - (Optional) A boolean specifying whether to add a random suffix to the pathname. It defaults to false. We recommend using this option to ensure there are no conflicts in your blob filenames.
 *   - allowOverwrite - (Optional) A boolean to allow overwriting blobs. By default an error will be thrown if you try to overwrite a blob by using the same pathname for multiple blobs.
 *   - contentType - (Optional) A string indicating the media type. By default, it's extracted from the pathname's extension.
 *   - cacheControlMaxAge - (Optional) A number in seconds to configure how long Blobs are cached. Defaults to one month. Cannot be set to a value lower than 1 minute.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - multipart - (Optional) Whether to use multipart upload for large files. It will split the file into multiple parts, upload them in parallel and retry failed parts.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 *   - onUploadProgress - (Optional) Callback to track upload progress: onUploadProgress(\{loaded: number, total: number, percentage: number\})
 * @returns A promise that resolves to the blob information, including pathname, contentType, contentDisposition, url, and downloadUrl.
 */
export const put = createPutMethod<PutCommandOptions>({
  allowedOptions: [
    'cacheControlMaxAge',
    'addRandomSuffix',
    'allowOverwrite',
    'contentType',
    'ifMatch',
  ],
});

//  vercelBlob.del()

export { del } from './del';

// vercelBlob.head()

export type { HeadBlobResult } from './head';
export { head } from './head';

// vercelBlob.get()

export type { GetBlobResult, GetCommandOptions } from './get';
export { get } from './get';

// vercelBlob.list()

export type {
  ListBlobResult,
  ListBlobResultBlob,
  ListCommandOptions,
  ListFoldedBlobResult,
} from './list';
export { list } from './list';

// vercelBlob.copy()

export type { CopyBlobResult, CopyCommandOptions } from './copy';
export { copy } from './copy';

// vercelBlob. createMultipartUpload()
// vercelBlob. uploadPart()
// vercelBlob. completeMultipartUpload()
// vercelBlob. createMultipartUploader()

/**
 * Creates a multipart upload. This is the first step in the manual multipart upload process.
 *
 * @param pathname - A string specifying the path inside the blob store. This will be the base value of the return URL and includes the filename and extension.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Public blobs are accessible via URL, private blobs require authentication.
 *   - addRandomSuffix - (Optional) A boolean specifying whether to add a random suffix to the pathname. It defaults to true.
 *   - allowOverwrite - (Optional) A boolean to allow overwriting blobs. By default an error will be thrown if you try to overwrite a blob by using the same pathname for multiple blobs.
 *   - contentType - (Optional) The media type for the file. If not specified, it's derived from the file extension. Falls back to application/octet-stream when no extension exists or can't be matched.
 *   - cacheControlMaxAge - (Optional) A number in seconds to configure the edge and browser cache. Defaults to one month.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to an object containing:
 *   - key: A string that identifies the blob object.
 *   - uploadId: A string that identifies the multipart upload. Both are needed for subsequent uploadPart calls.
 */
export const createMultipartUpload =
  createCreateMultipartUploadMethod<CommonCreateBlobOptions>({
    allowedOptions: [
      'cacheControlMaxAge',
      'addRandomSuffix',
      'allowOverwrite',
      'contentType',
      'ifMatch',
    ],
  });

/**
 * Creates a multipart uploader that simplifies the multipart upload process.
 * This is a wrapper around the manual multipart upload process that provides a more convenient API.
 *
 * @param pathname - A string specifying the path inside the blob store. This will be the base value of the return URL and includes the filename and extension.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Public blobs are accessible via URL, private blobs require authentication.
 *   - addRandomSuffix - (Optional) A boolean specifying whether to add a random suffix to the pathname. It defaults to true.
 *   - allowOverwrite - (Optional) A boolean to allow overwriting blobs. By default an error will be thrown if you try to overwrite a blob by using the same pathname for multiple blobs.
 *   - contentType - (Optional) The media type for the file. If not specified, it's derived from the file extension. Falls back to application/octet-stream when no extension exists or can't be matched.
 *   - cacheControlMaxAge - (Optional) A number in seconds to configure the edge and browser cache. Defaults to one month.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to an uploader object with the following properties and methods:
 *   - key: A string that identifies the blob object.
 *   - uploadId: A string that identifies the multipart upload.
 *   - uploadPart: A method to upload a part of the file.
 *   - complete: A method to complete the multipart upload process.
 */
export const createMultipartUploader =
  createCreateMultipartUploaderMethod<CommonCreateBlobOptions>({
    allowedOptions: [
      'cacheControlMaxAge',
      'addRandomSuffix',
      'allowOverwrite',
      'contentType',
      'ifMatch',
    ],
  });

export type { UploadPartCommandOptions };

/**
 * Uploads a part of a multipart upload.
 * Used as part of the manual multipart upload process.
 *
 * @param pathname - Same value as the pathname parameter passed to createMultipartUpload. This will influence the final URL of your blob.
 * @param body - A blob object as ReadableStream, String, ArrayBuffer or Blob based on these supported body types. Each part must be a minimum of 5MB, except the last one which can be smaller.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Public blobs are accessible via URL, private blobs require authentication.
 *   - uploadId - (Required) A string returned from createMultipartUpload which identifies the multipart upload.
 *   - key - (Required) A string returned from createMultipartUpload which identifies the blob object.
 *   - partNumber - (Required) A number identifying which part is uploaded (1-based index).
 *   - contentType - (Optional) The media type for the blob. By default, it's derived from the pathname.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - addRandomSuffix - (Optional) A boolean specifying whether to add a random suffix to the pathname.
 *   - allowOverwrite - (Optional) A boolean to allow overwriting blobs.
 *   - cacheControlMaxAge - (Optional) A number in seconds to configure how long Blobs are cached.
 *   - abortSignal - (Optional) AbortSignal to cancel the running request.
 *   - onUploadProgress - (Optional) Callback to track upload progress: onUploadProgress(\{loaded: number, total: number, percentage: number\})
 * @returns A promise that resolves to the uploaded part information containing etag and partNumber, which will be needed for the completeMultipartUpload call.
 */
export const uploadPart = createUploadPartMethod<UploadPartCommandOptions>({
  allowedOptions: [
    'cacheControlMaxAge',
    'addRandomSuffix',
    'allowOverwrite',
    'contentType',
  ],
});

export type { CompleteMultipartUploadCommandOptions };

/**
 * Completes a multipart upload by combining all uploaded parts.
 * This is the final step in the manual multipart upload process.
 *
 * @param pathname - Same value as the pathname parameter passed to createMultipartUpload.
 * @param parts - An array containing all the uploaded parts information from previous uploadPart calls. Each part must have properties etag and partNumber.
 * @param options - Configuration options including:
 *   - access - (Required) Must be 'public' or 'private'. Public blobs are accessible via URL, private blobs require authentication.
 *   - uploadId - (Required) A string returned from createMultipartUpload which identifies the multipart upload.
 *   - key - (Required) A string returned from createMultipartUpload which identifies the blob object.
 *   - contentType - (Optional) The media type for the file. If not specified, it's derived from the file extension.
 *   - token - (Optional) A string specifying the token to use when making requests. It defaults to process.env.BLOB_READ_WRITE_TOKEN when deployed on Vercel.
 *   - addRandomSuffix - (Optional) A boolean specifying whether to add a random suffix to the pathname. It defaults to true.
 *   - allowOverwrite - (Optional) A boolean to allow overwriting blobs.
 *   - cacheControlMaxAge - (Optional) A number in seconds to configure the edge and browser cache. Defaults to one month.
 *   - abortSignal - (Optional) AbortSignal to cancel the operation.
 * @returns A promise that resolves to the finalized blob information, including pathname, contentType, contentDisposition, url, and downloadUrl.
 */
export const completeMultipartUpload =
  createCompleteMultipartUploadMethod<CompleteMultipartUploadCommandOptions>({
    allowedOptions: [
      'cacheControlMaxAge',
      'addRandomSuffix',
      'allowOverwrite',
      'contentType',
    ],
  });

export type {
  CreateFolderCommandOptions,
  CreateFolderResult,
} from './create-folder';
export { createFolder } from './create-folder';
export type { Part, PartInput } from './multipart/helpers';
