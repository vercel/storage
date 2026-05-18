/**
 * Upload / blob constraints shared between `generateClientTokenFromReadWriteToken` and
 * `issueSignedToken` (serialized in the JSON body to the control API where supported).
 */
export interface BlobClientTokenConstraintOptions {
  /**
   * A number specifying the maximum size in bytes that can be uploaded. The maximum is 5TB.
   */
  maximumSizeInBytes?: number;

  /**
   * An array of strings specifying the media types that are allowed to be uploaded.
   * By default, it's all content types. Wildcards are supported (text/*).
   */
  allowedContentTypes?: string[];

  /**
   * A number specifying the timestamp in ms when the token will expire.
   * For client tokens, defaults to now + 1 hour when omitted.
   */
  validUntil?: number;

  /**
   * Adds a random suffix to the filename.
   * @defaultvalue false
   */
  addRandomSuffix?: boolean;

  /**
   * Allow overwriting an existing blob. By default this is set to false and will throw an error if the blob already exists.
   * @defaultvalue false
   */
  allowOverwrite?: boolean;

  /**
   * Number in seconds to configure how long Blobs are cached. Defaults to one month. Cannot be set to a value lower than 1 minute.
   * @defaultvalue 30 * 24 * 60 * 60 (1 Month)
   */
  cacheControlMaxAge?: number;

  /**
   * Only write if the ETag matches (optimistic concurrency control).
   * Use this for conditional writes to prevent overwriting changes made by others.
   * If the ETag doesn't match, a `BlobPreconditionFailedError` will be thrown.
   */
  ifMatch?: string;

  /**
   * Configuration for upload completion callback.
   */
  onUploadCompleted?: {
    callbackUrl: string;
    tokenPayload?: string | null;
  };
}
