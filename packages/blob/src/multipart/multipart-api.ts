import EventEmitter from 'node:events';
import type { BodyInit } from 'undici';
import bytes from 'bytes';
import { requestApi } from '../api';
import type { BlobCommandOptions } from '../helpers';
import type { UploadPart, UploadPartApiResponse } from '../put-multipart';
import { debug } from '../debug';
import type { MultipartMemory } from './multipart-memory';

export const maxConcurrentUploads = typeof window !== 'undefined' ? 6 : 8;

export class MultipartApi extends EventEmitter {
  private partsToUpload: UploadPart[] = [];

  private _activeUploads = 0;
  private _totalBytesSent = 0;

  private readonly abortController = new AbortController();

  private canceled = false;

  constructor(
    private readonly uploadId: string,
    private readonly key: string,
    private readonly pathname: string,
    private readonly headers: Record<string, string>,
    private readonly options: BlobCommandOptions,
    private readonly memory: MultipartMemory,
  ) {
    super();
  }

  public get activeUploads(): number {
    return this._activeUploads;
  }

  public get totalBytesSent(): number {
    return this._totalBytesSent;
  }

  public upload(part: UploadPart): void {
    debug('mpu api: queue part', part.partNumber);

    this.partsToUpload.push(part);

    this.evaluateQueue();
  }

  public evaluateQueue(): void {
    if (this.canceled) {
      return;
    }

    debug(
      'mpu api: evaluate queue',
      'activeUploads:',
      this._activeUploads,
      'maxConcurrentUploads:',
      maxConcurrentUploads,
      'partsToUpload:',
      this.partsToUpload.length,
    );

    while (
      this._activeUploads < maxConcurrentUploads &&
      this.hasPartsToUpload
    ) {
      const partToSend = this.partsToUpload.shift();

      if (partToSend) {
        void this.uploadPart(partToSend);
      }
    }
  }

  public get hasPartsToUpload(): boolean {
    return this.partsToUpload.length > 0;
  }

  private async uploadPart(part: UploadPart): Promise<void> {
    if (this.canceled) {
      return;
    }

    this._activeUploads++;

    debug('mpu api: upload part', part.partNumber, 'size:', part.blob.size);

    const completedPart = await requestApi<UploadPartApiResponse>(
      `/mpu/${this.pathname}`,
      {
        signal: this.abortController.signal,
        method: 'POST',
        headers: {
          ...this.headers,
          'x-mpu-action': 'upload',
          'x-mpu-key': encodeURI(this.key),
          'x-mpu-upload-id': this.uploadId,
          'x-mpu-part-number': part.partNumber.toString(),
        },
        // weird things between undici types and native fetch types
        body: part.blob as BodyInit,
      },
      this.options,
    );

    debug(
      'mpu api: completed upload part',
      part.partNumber,
      'activeUploads',
      this._activeUploads,
      'bytesSent:',
      bytes(this._totalBytesSent),
    );

    this.memory.freeSpace(part.blob.size);

    this._activeUploads--;
    this._totalBytesSent += part.blob.size;

    this.evaluateQueue();

    this.emit('completePart', {
      partNumber: part.partNumber,
      etag: completedPart.etag,
    });
  }

  public cancel(): void {
    debug('mpu api: cancel');

    this.canceled = true;
    this.abortController.abort();
  }
}
