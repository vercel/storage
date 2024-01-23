// Most browsers will cap requests at 6 concurrent uploads per domain (Vercel Blob API domain)

import bytes from 'bytes';
import type { MultipartReader } from './multipart-reader';

// In other environments, we can afford to be more aggressive
const MaxConcurrentUploads = typeof window !== 'undefined' ? 6 : 8;

// 5MB is the minimum part size accepted by Vercel Blob, but we set our default part size to 8mb like the aws cli
export const PartSizeInBytes = 8 * 1024 * 1024;

const MaxBytesInMemory = MaxConcurrentUploads * PartSizeInBytes * 2;

export class MultipartMemory {
  private currentBytesInMemory = 0;

  private _reader: MultipartReader | undefined;

  public set reader(reader: MultipartReader) {
    this._reader = reader;
  }

  public hasSpace(): boolean {
    return this.currentBytesInMemory < MaxBytesInMemory;
  }

  public useSpace(value: number): void {
    this.currentBytesInMemory += value;
  }

  public freeSpace(value: number): void {
    this.currentBytesInMemory -= value;

    // restart the reader if paused because of not enough memory space
    if (this._reader && !this._reader.done && !this._reader.reading) {
      void this._reader.read();
    }
  }

  public spaceUsed(): number {
    return this.currentBytesInMemory / MaxBytesInMemory;
  }

  public debug(): string {
    return `${bytes(this.currentBytesInMemory)}/${bytes(MaxBytesInMemory)}`;
  }
}
