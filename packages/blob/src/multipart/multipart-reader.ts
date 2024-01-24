import EventEmitter from 'node:events';
import { debug } from '../debug';
import { BlobError } from '../helpers';
import { PartSizeInBytes, type MultipartMemory } from './multipart-memory';

// responsible for reading a stream and emitting parts with the correct size
export class MultipartReader extends EventEmitter {
  // if the stream is done or canceled
  private doneReading = false;
  private isReading = false;

  private currentPartNumber = 1;

  // holds data until we have enough to send a part
  private currentPart: ArrayBuffer[] = [];
  private currentPartSize = 0;

  private _streamReader: ReadableStreamDefaultReader<ArrayBuffer> | undefined;

  constructor(private readonly memory: MultipartMemory) {
    super();
  }

  private emitPart(): void {
    const newPart = {
      partNumber: this.currentPartNumber++,
      blob: new Blob(this.currentPart, { type: 'application/octet-stream' }),
    };

    debug('mpu reader: emit part', newPart.partNumber);

    this.emit('part', newPart);

    // reset tmp storage for the next part
    this.currentPart = [];
    this.currentPartSize = 0;
  }

  // This code ensures that each part will be exactly of `partSizeInBytes` size
  // Otherwise R2 will refuse it. AWS S3 is fine with parts of different sizes.
  private processValue(value: ArrayBuffer): void {
    let valueOffset = 0;

    try {
      while (valueOffset < value.byteLength) {
        const remainingPartSize = PartSizeInBytes - this.currentPartSize;

        const endOffset = Math.min(
          valueOffset + remainingPartSize,
          value.byteLength,
        );

        const chunk = value.slice(valueOffset, endOffset);

        this.currentPart.push(chunk);
        this.currentPartSize += chunk.byteLength;

        valueOffset = endOffset;

        const partIsReady = this.currentPartSize === PartSizeInBytes;
        if (partIsReady) {
          this.emitPart();
        }
      }
    } catch (error) {
      debug('mpu reader: error', error);

      this.emit('error', error);
    }
  }

  private onFreeSpace(): void {
    this.memory.removeListener('freeSpace', this.onFreeSpace.bind(this));

    if (this.doneReading || this.isReading) {
      return;
    }

    void this.read();
  }

  public set streamReader(
    streamReader: ReadableStreamDefaultReader<ArrayBuffer>,
  ) {
    this._streamReader = streamReader;
  }

  public async read(): Promise<void> {
    try {
      if (this.doneReading || this.isReading) {
        return;
      }

      if (!this._streamReader) {
        throw new BlobError('mpu reader error: no reader');
      }

      debug(
        'mpu reader: start reading',
        'currentPartNumber:',
        this.currentPartNumber,
        'currentPartSize:',
        this.currentPartSize,
      );

      this.memory.debug();

      this.isReading = true;

      while (this.memory.hasSpace()) {
        // eslint-disable-next-line no-await-in-loop -- A for loop is fine here.
        const { value, done } = await this._streamReader.read();

        if (done) {
          this.doneReading = true;
          this._streamReader = undefined;

          debug('mpu: upload read consumed the whole stream');

          // subscriber can decide to flush or read another stream
          this.emit('done');

          return;
        }

        this.memory.useSpace(value.byteLength);

        this.processValue(value);
      }

      debug(
        'mpu reader: end read',
        'currentPartNumber:',
        this.currentPartNumber,
        'currentPartSize:',
        this.currentPartSize,
      );

      this.memory.debug();

      this.isReading = false;

      // resume reading if there is space in memory
      this.memory.on('freeSpace', this.onFreeSpace.bind(this));
    } catch (error) {
      debug('mpu reader: error', error);

      this.emit('error', error);
    }
  }

  public get done(): boolean {
    return this.doneReading && this.currentPart.length === 0;
  }

  // send the remaining data in memory
  public flush(): void {
    if (this.currentPart.length > 0) {
      this.emitPart();
    }
  }

  public cancel(): void {
    debug('mpu reader: cancel');

    this.doneReading = true;

    this._streamReader?.releaseLock();
    this._streamReader = undefined;
  }
}
