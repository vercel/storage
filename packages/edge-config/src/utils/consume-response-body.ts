/**
 * This function reads the respone body
 *
 * Reading the response body serves two purposes
 *
 * 1) In Node.js it avoids memory leaks
 *
 * See https://github.com/nodejs/undici/blob/v5.21.2/README.md#garbage-collection
 * See https://github.com/node-fetch/node-fetch/issues/83
 *
 * 2) In Cloudflare it avoids running into a deadlock. They have a maximum number
 * of concurrent fetches (which is documented). Concurrency counts until the
 * body of a response is read. It is not uncommon to never read a response body
 * (e.g. if you only care about the status code). This can lead to deadlock as
 * fetches appear to never resolve.
 *
 * See https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections
 */
export async function consumeResponseBody(res: Response): Promise<void> {
  await res.arrayBuffer();
}
