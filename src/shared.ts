export const ERRORS = {
  UNEXPECTED: '@vercel/edge-config: Unexpected error',
  UNAUTHORIZED: '@vercel/edge-config: Unauthorized',
  NETWORK: '@vercel/edge-config: Network error',
  EDGE_CONFIG_NOT_FOUND: '@vercel/edge-config: Edge Config not found',
};

/**
 * Checks if an object has a property
 */
export function hasOwnProperty<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const ret: Partial<T> = {};
  keys.forEach((key) => {
    ret[key] = obj[key];
  });
  return ret as Pick<T, K>;
}

export function assertIsKey(key: unknown): asserts key is string {
  if (typeof key !== 'string') {
    throw new Error('@vercel/edge-config: Expected key to be a string');
  }
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
export function clone<T>(value: T): T {
  // only available since node v17.0.0
  if (typeof structuredClone === 'function') return structuredClone<T>(value);

  // poor man's polyfill for structuredClone
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Parse the edgeConfigId and token from an Edge Config Connection String.
 *
 * Edge Config Connection Strings look like this:
 * https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 *
 * @param text - A potential Edge Config Connection String
 * @returns The edgeConfgId and token parsed from the given text or null if
 * the given text was not a valid Edge Config Connection String.
 */
export function matchEdgeConfigConnectionString(
  text: string,
): { edgeConfigId: string; token: string } | null {
  const url = new URL(text);
  if (url.host !== 'edge-config.vercel.com') return null;
  if (url.protocol !== 'https:') return null;
  if (!url.pathname.startsWith('/ecfg')) return null;

  const edgeConfigId = url.pathname.split('/')[1];
  if (!edgeConfigId) return null;

  const token = url.searchParams.get('token');
  if (!token || token === '') return null;

  return { edgeConfigId, token };
}
