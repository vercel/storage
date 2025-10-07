import { trace } from './tracing';

/**
 * Checks if an object has a property
 */
export function hasOwn<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const ret: Partial<T> = {};
  for (const key of keys) {
    ret[key] = obj[key];
  }
  return ret as Pick<T, K>;
}

export function assertIsKey(key: unknown): asserts key is string {
  if (typeof key !== 'string') {
    throw new Error('@vercel/edge-config: Expected key to be a string');
  }
}

export function isEmptyKey(key: string): boolean {
  return key.trim() === '';
}

export function assertIsKeys(keys: unknown): asserts keys is string[] {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
    throw new Error(
      '@vercel/edge-config: Expected keys to be an array of string',
    );
  }
}

/**
 * Creates a deep clone of an object.
 */
export const clone = trace(
  function clone<T>(value: T): T {
    // only available since node v17.0.0
    if (typeof structuredClone === 'function') return structuredClone<T>(value);

    // poor man's polyfill for structuredClone
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
  },
  { name: 'clone' },
);
