/**
 * Uses `MAX_SAFE_INTEGER` as minimum updated at timestamp to force
 * a request to the origin.
 */
export function addConsistentReadHeader(headers: Headers): void {
  headers.set('x-edge-config-min-updated-at', `${Number.MAX_SAFE_INTEGER}`);
}
