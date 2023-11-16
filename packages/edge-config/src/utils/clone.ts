/**
 * Creates a deep clone of an object.
 */
export function clone<T>(value: T): T {
  // only available since node v17.0.0
  if (typeof structuredClone === 'function') return structuredClone<T>(value);

  // poor man's polyfill for structuredClone
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
