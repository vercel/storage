import { BlobServiceNotAvailable } from './api';
import type { CompletedPart } from './put-multipart';

export class MultipartController {
  private _canceled = false;
  private completedParts: CompletedPart[] = [];

  private _reject: (error: unknown) => void = () => {
    /** noop */
  };
  private _resolve: (parts: CompletedPart[]) => void = () => {
    /** noop */
  };

  public set reject(reject: () => void) {
    this._reject = reject;
  }

  public set resolve(resolve: () => void) {
    this._resolve = resolve;
  }

  public get canceled(): boolean {
    return this._canceled;
  }

  public cancel(error: unknown): void {
    if (this._canceled) {
      return;
    }

    this._canceled = true;
    this.reject();

    if (
      error instanceof TypeError &&
      (error.message === 'Failed to fetch' || error.message === 'fetch failed')
    ) {
      this._reject(new BlobServiceNotAvailable());
    } else {
      this._reject(error);
    }
  }

  public completePart(part: CompletedPart): void {
    this.completedParts.push(part);
  }
}
