import EventEmitter from 'node:events';
import { debug } from '../debug';
import { PartSizeInBytes, type MultipartMemory } from './multipart-memory';

export class MultipartReader extends EventEmitter {
  private _done = false;
  private _reading = false;

  private currentPartNumber = 1;

  // holds data until we have enough to send a part
  private currentPart: ArrayBuffer[] = [];
  private currentPartSize = 0;

  private reader: ReadableStreamDefaultReader<ArrayBuffer> | undefined;

  constructor(private readonly memory: MultipartMemory) {
    super();
  }

  private get partNumber(): number {
    return this.currentPartNumber++;
  }

  private uploadPart(): void {
    const newPart = {
      partNumber: this.partNumber,
      blob: new Blob(this.currentPart, { type: 'application/octet-stream' }),
    };

    debug('mpu reader: emit part', newPart.partNumber);

    this.emit('part', newPart);

    this.currentPart = [];
    this.currentPartSize = 0;
  }

  private get partIsReady(): boolean {
    return this.currentPartSize === PartSizeInBytes;
  }

  // This code ensures that each part will be exactly of `partSizeInBytes` size
  // Otherwise R2 will refuse it. AWS S3 is fine with parts of different sizes.
  private processValue(value: ArrayBuffer): void {
    let valueOffset = 0;
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

      if (this.partIsReady) {
        this.uploadPart();
      }
    }
  }

  private onFreeSpace(): void {
    if (this._done || this._reading) {
      return;
    }

    this.memory.removeListener('freeSpace', this.onFreeSpace.bind(this));

    void this.read();
  }

  public async read(
    reader?: ReadableStreamDefaultReader<ArrayBuffer>,
  ): Promise<void> {
    // use the new reader
    if (reader) {
      this.reader = reader;
    }

    if (!this.reader) {
      throw new Error('No reader');
    }

    debug(
      'mpu reader: start reading',
      'currentPartNumber:',
      this.currentPartNumber,
      'currentPartSize:',
      this.currentPartSize,
    );

    this.memory.debug();

    this._reading = true;

    while (this.memory.hasSpace()) {
      // eslint-disable-next-line no-await-in-loop -- A for loop is fine here.
      const { value, done } = await this.reader.read();

      if (done) {
        this._done = true;
        this.reader = undefined;

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

    this._reading = false;

    // resume reading if there is space in memory
    this.memory.on('freeSpace', this.onFreeSpace.bind(this));
  }

  public get done(): boolean {
    return this._done && this.currentPart.length === 0;
  }

  // send the remaining data in memory
  public flush(): void {
    if (this.currentPart.length > 0) {
      this.uploadPart();
    }
  }

  public cancel(): void {
    this._done = true;
    this.reader?.releaseLock();
  }
}
