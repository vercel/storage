import { waitUntil } from '@vercel/functions';

export function after(fn: () => Promise<unknown>): void {
  waitUntil(
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    }).then(() => fn()),
  );
}
