import bytes from 'bytes';
import { debug } from '../debug';
import { BlobError } from '../helpers';
import { Event } from './event';

// Most browsers will cap requests at 6 concurrent uploads per domain (Vercel Blob API domain)
// In other environments, we can afford to be more aggressive
export const MaxConcurrentUploads = typeof window !== 'undefined' ? 6 : 8;

// 5MB is the minimum part size accepted by Vercel Blob, but we set our default part size to 8mb like the aws cli
export const PartSizeInBytes = 8 * 1024 * 1024;

const MaxBytesInMemory = MaxConcurrentUploads * PartSizeInBytes * 2;

// manages the memory used by the multipart upload
export class MultipartMemory {
  private availableMemorySpace = MaxBytesInMemory;

  public freeSpaceEvent = new Event<number>();

  public hasSpace(): boolean {
    return this.availableMemorySpace > 0;
  }

  public useSpace(value: number): void {
    if (!this.hasSpace()) {
      throw new BlobError('mpu memory Error: no memory space left to use.');
    }

    this.availableMemorySpace -= value;
  }

  public freeSpace(value: number): void {
    this.availableMemorySpace += value;

    debug('mpu memory: free space', bytes(value));
    this.debug();

    this.freeSpaceEvent.emit(this.availableMemorySpace);
  }

  public debug(): void {
    debug('mpu memory usage:', bytes(this.availableMemorySpace));
  }
}
