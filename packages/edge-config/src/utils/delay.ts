export function delay<T>(
  timeoutMs: number,
  data: T,
  assign?: (timeoutId?: NodeJS.Timeout) => void,
): Promise<T> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(data), timeoutMs);
    assign?.(timeoutId);
  });
}
