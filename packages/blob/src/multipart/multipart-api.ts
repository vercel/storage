import type { BodyInit } from 'undici';
import { requestApi } from '../api';
import type { BlobCommandOptions } from '../helpers';
import type {
  CompletedPart,
  UploadPart,
  UploadPartApiResponse,
} from '../put-multipart';
import { debug } from '../debug';
import { MaxConcurrentUploads, type MultipartMemory } from './multipart-memory';
import { Event } from './event';

// responsible for queueing and uploading parts
export class MultipartApi {
  private partsToUpload: UploadPart[] = [];

  private _activeUploads = 0;

  private readonly abortController = new AbortController();

  private canceled = false;

  public errorEvent = new Event<unknown>();
  public completePartEvent = new Event<CompletedPart>();

  constructor(
    private readonly uploadId: string,
    private readonly key: string,
    private readonly pathname: string,
    private readonly headers: Record<string, string>,
    private readonly options: BlobCommandOptions,
    private readonly memory: MultipartMemory,
  ) {}

  public get activeUploads(): number {
    return this._activeUploads;
  }

  public enqueuePart(part: UploadPart): void {
    debug('mpu api: queue part', part.partNumber);

    this.partsToUpload.push(part);

    this.evaluateQueue();
  }

  public hasPartsToUpload(): boolean {
    return this.partsToUpload.length > 0;
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
      MaxConcurrentUploads,
      'partsToUpload:',
      this.partsToUpload.length,
    );

    while (
      this._activeUploads < MaxConcurrentUploads &&
      this.hasPartsToUpload()
    ) {
      const partToSend = this.partsToUpload.shift();

      if (partToSend) {
        void this.uploadPart(partToSend);
      }
    }
  }

  private async uploadPart(part: UploadPart): Promise<void> {
    if (this.canceled) {
      return;
    }

    this._activeUploads++;

    debug('mpu api: upload part', part.partNumber, 'size:', part.blob.size);

    try {
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
      );

      this.memory.freeSpace(part.blob.size);

      this._activeUploads--;

      this.evaluateQueue();

      this.completePartEvent.emit({
        partNumber: part.partNumber,
        etag: completedPart.etag,
      });
    } catch (error) {
      debug('mpu api: error', error);

      this.errorEvent.emit(error);
    }
  }

  public cancel(): void {
    debug('mpu api: cancel');

    this.canceled = true;
    this.abortController.abort();
  }
}
