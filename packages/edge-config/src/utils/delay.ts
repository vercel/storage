export function delay<T>(timeoutMs: number, data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), timeoutMs));
}
