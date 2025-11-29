import { readFile } from '@vercel/edge-config-fs';
import { name as sdkName, version as sdkVersion } from '../package.json';
import type {
  Connection,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from './types';
import {
  ERRORS,
  isEmptyKey,
  parseConnectionString,
  UnexpectedNetworkError,
} from './utils';
import { fetchWithCachedResponse } from './utils/fetch-with-cached-response';
import { readBuildEmbeddedEdgeConfig } from './utils/read-build-embedded-edge-config';
import { trace } from './utils/tracing';

const X_EDGE_CONFIG_SDK_HEADER =
  typeof sdkName === 'string' && typeof sdkVersion === 'string'
    ? `${sdkName}@${sdkVersion}`
    : '';

type HeadersRecord = Record<string, string>;

const jsonParseCache = new Map<string, unknown>();

const readFileTraced = trace(readFile, { name: 'readFile' });
const jsonParseTraced = trace(JSON.parse, { name: 'JSON.parse' });

const privateEdgeConfigSymbol = Symbol.for('privateEdgeConfig');

const cachedJsonParseTraced = trace(
  (edgeConfigId: string, content: string) => {
    const cached = jsonParseCache.get(edgeConfigId);
    if (cached) return cached;

    const parsed = jsonParseTraced(content) as unknown;

    // freeze the object to avoid mutations of the return value of a "get" call
    // from affecting the return value of future "get" calls
    jsonParseCache.set(edgeConfigId, Object.freeze(parsed));
    return parsed;
  },
  { name: 'cached JSON.parse' },
);

/**
 * Reads an Edge Config from the local file system.
 * This is used at runtime on serverless functions.
 */
const getFileSystemEdgeConfig = trace(
  async function getFileSystemEdgeConfig(
    connectionType: Connection['type'],
    connectionId: Connection['id'],
  ): Promise<EmbeddedEdgeConfig | null> {
    // can't optimize non-vercel hosted edge configs
    if (connectionType !== 'vercel') return null;
    // can't use fs optimizations outside of lambda
    if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return null;

    try {
      const content = await readFileTraced(
        `/opt/edge-config/${connectionId}.json`,
        'utf-8',
      );

      return cachedJsonParseTraced(connectionId, content) as EmbeddedEdgeConfig;
    } catch {
      return null;
    }
  },
  {
    name: 'getFileSystemEdgeConfig',
  },
);

/**
 * Will return an embedded Edge Config object from memory,
 * but only when the `privateEdgeConfigSymbol` is in global scope.
 */
const getPrivateEdgeConfig = trace(
  async function getPrivateEdgeConfig(
    connectionId: Connection['id'],
  ): Promise<EmbeddedEdgeConfig | null> {
    const privateEdgeConfig = Reflect.get(
      globalThis,
      privateEdgeConfigSymbol,
    ) as
      | {
          get: (id: string) => Promise<EmbeddedEdgeConfig | null>;
        }
      | undefined;

    if (
      typeof privateEdgeConfig === 'object' &&
      typeof privateEdgeConfig.get === 'function'
    ) {
      return privateEdgeConfig.get(connectionId);
    }

    return null;
  },
  {
    name: 'getPrivateEdgeConfig',
  },
);

export async function getBundledEdgeConfig(
  connectionId: Connection['id'],
  _fetchCache: EdgeConfigClientOptions['cache'],
): Promise<{
  data: EmbeddedEdgeConfig;
  updatedAt: number | undefined;
} | null> {
  return readBuildEmbeddedEdgeConfig<{
    data: EmbeddedEdgeConfig;
    updatedAt: number | undefined;
  }>(connectionId);
}

/**
 * Reads the Edge Config from a local provider, if available,
 * to avoid Network requests.
 */
export async function getLocalEdgeConfig(
  connectionType: Connection['type'],
  connectionId: Connection['id'],
  _fetchCache: EdgeConfigClientOptions['cache'],
): Promise<EmbeddedEdgeConfig | null> {
  const edgeConfig =
    (await getPrivateEdgeConfig(connectionId)) ||
    (await getFileSystemEdgeConfig(connectionType, connectionId));

  return edgeConfig;
}

type GetConfigFunction = (
  fetchCache: EdgeConfigClientOptions['cache'],
  staleIfError: EdgeConfigClientOptions['staleIfError'],
) => Promise<EmbeddedEdgeConfig | null>;
const inMemoryEdgeConfigsGetterMap = new Map<string, GetConfigFunction>();
function getOrCreateGetInMemoryEdgeConfigByConnection(
  connectionString: string,
): GetConfigFunction {
  const getConfig = inMemoryEdgeConfigsGetterMap.get(connectionString);
  if (getConfig) return getConfig;

  const newGetConfig = (() => {
    const connection = parseConnectionString(connectionString);

    if (!connection)
      throw new Error(
        '@vercel/edge-config: Invalid connection string provided',
      );

    const headersRecord: HeadersRecord = {
      Authorization: `Bearer ${connection.token}`,
    };

    if (typeof process !== 'undefined' && process.env.VERCEL_ENV)
      headersRecord['x-edge-config-vercel-env'] = process.env.VERCEL_ENV;

    if (X_EDGE_CONFIG_SDK_HEADER)
      headersRecord['x-edge-config-sdk'] = X_EDGE_CONFIG_SDK_HEADER;

    // Functions as cache to keep track of the Edge Config.
    let embeddedEdgeConfigPromise: Promise<EmbeddedEdgeConfig | null> | null =
      null;

    // Promise that points to the most recent request.
    // It'll ensure that subsequent calls won't make another fetch call,
    // while one is still on-going.
    // Will overwrite `embeddedEdgeConfigPromise` only when resolved.
    let latestRequest: Promise<EmbeddedEdgeConfig | null> | null = null;

    return trace(
      (
        fetchCache: EdgeConfigClientOptions['cache'],
        staleIfError: EdgeConfigClientOptions['staleIfError'],
      ) => {
        if (!latestRequest) {
          const headers = new Headers(headersRecord);
          if (typeof staleIfError === 'number' && staleIfError > 0) {
            headers.set('cache-control', `stale-if-error=${staleIfError}`);
          } else {
            headers.delete('cache-control');
          }

          latestRequest = fetchWithCachedResponse(
            `${connection.baseUrl}/items?version=${connection.version}`,
            {
              headers,
              cache: fetchCache,
            },
          ).then(async (res) => {
            const digest = res.headers.get('x-edge-config-digest');
            let body: EdgeConfigValue | undefined;

            // We ignore all errors here and just proceed.
            if (!res.ok) {
              await consumeResponseBody(res);
              body = res.cachedResponseBody as EdgeConfigValue | undefined;
              if (!body) return null;
            } else {
              body = (await res.json()) as EdgeConfigItems;
            }

            return { digest, items: body } as EmbeddedEdgeConfig;
          });

          // Once the request is resolved, we set the proper config to the promise
          // such that the next call will return the resolved value.
          latestRequest.then(
            (resolved) => {
              embeddedEdgeConfigPromise = Promise.resolve(resolved);
              latestRequest = null;
            },
            // Attach a `.catch` handler to this promise so that if it does throw,
            // we don't get an unhandled promise rejection event. We unset the
            // `latestRequest` so that the next call will make a new request.
            () => {
              embeddedEdgeConfigPromise = null;
              latestRequest = null;
            },
          );
        }

        if (!embeddedEdgeConfigPromise) {
          // If the `embeddedEdgeConfigPromise` is `null`, it means that there's
          // no previous request, so we'll set the `latestRequest` to the current
          // request.
          embeddedEdgeConfigPromise = latestRequest;
        }

        return embeddedEdgeConfigPromise;
      },
      {
        name: 'getInMemoryEdgeConfig',
      },
    );
  })();

  inMemoryEdgeConfigsGetterMap.set(connectionString, newGetConfig);

  return newGetConfig;
}

/**
 * Returns a function to retrieve the entire Edge Config.
 * It'll keep the fetched Edge Config in memory, making subsequent calls fast,
 * while revalidating in the background.
 */
export async function getInMemoryEdgeConfig(
  connectionString: string,
  fetchCache: EdgeConfigClientOptions['cache'],
  staleIfError: EdgeConfigClientOptions['staleIfError'],
): Promise<EmbeddedEdgeConfig | null> {
  const getConfig =
    getOrCreateGetInMemoryEdgeConfigByConnection(connectionString);
  return getConfig(fetchCache, staleIfError);
}

/**
 * Fetches an edge config item from the API
 */
export async function fetchEdgeConfigItem<T = EdgeConfigValue>(
  baseUrl: string,
  key: string,
  version: string,
  consistentRead: undefined | boolean,
  localHeaders: HeadersRecord,
  fetchCache: EdgeConfigClientOptions['cache'],
  timeoutMs: number | undefined,
): Promise<T | undefined> {
  if (isEmptyKey(key)) return undefined;

  const headers = new Headers(localHeaders);
  if (consistentRead) {
    addConsistentReadHeader(headers);
  }
  return fetchWithCachedResponse(`${baseUrl}/item/${key}?version=${version}`, {
    headers,
    cache: fetchCache,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  }).then<T | undefined, undefined>(async (res) => {
    if (res.ok) return res.json();
    await consumeResponseBody(res);

    if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
    if (res.status === 404) {
      // if the x-edge-config-digest header is present, it means
      // the edge config exists, but the item does not
      if (res.headers.has('x-edge-config-digest')) return undefined;
      // if the x-edge-config-digest header is not present, it means
      // the edge config itself does not exist
      throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    }
    if (res.cachedResponseBody !== undefined)
      return res.cachedResponseBody as T;
    throw new UnexpectedNetworkError(res);
  });
}

/**
 * Determines if a key exists from the API
 */
export async function fetchEdgeConfigHas(
  baseUrl: string,
  key: string,
  version: string,
  consistentRead: undefined | boolean,
  localHeaders: HeadersRecord,
  fetchCache: EdgeConfigClientOptions['cache'],
  timeoutMs: undefined | number,
): Promise<boolean> {
  const headers = new Headers(localHeaders);
  if (consistentRead) {
    addConsistentReadHeader(headers);
  }
  // this is a HEAD request anyhow, no need for fetchWithCachedResponse
  return fetch(`${baseUrl}/item/${key}?version=${version}`, {
    method: 'HEAD',
    headers,
    cache: fetchCache,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  }).then((res) => {
    if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
    if (res.status === 404) {
      // if the x-edge-config-digest header is present, it means
      // the edge config exists, but the item does not
      if (res.headers.has('x-edge-config-digest')) return false;
      // if the x-edge-config-digest header is not present, it means
      // the edge config itself does not exist
      throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    }
    if (res.ok) return true;
    throw new UnexpectedNetworkError(res);
  });
}

/**
 * Fetches all or a list of edge config items from the API
 */
export async function fetchAllEdgeConfigItem<T = EdgeConfigItems>(
  baseUrl: string,
  keys: undefined | (keyof T)[],
  version: string,
  consistentRead: undefined | boolean,
  localHeaders: HeadersRecord,
  fetchCache: EdgeConfigClientOptions['cache'],
  timeoutMs: undefined | number,
): Promise<T> {
  let url = `${baseUrl}/items?version=${version}`;
  if (keys) {
    if (keys.length === 0) return Promise.resolve({} as T);

    const nonEmptyKeys = keys.filter(
      (key) => typeof key === 'string' && !isEmptyKey(key),
    );
    if (nonEmptyKeys.length === 0) return Promise.resolve({} as T);

    url += `&${new URLSearchParams(
      nonEmptyKeys.map((key) => ['key', key] as [string, string]),
    ).toString()}`;
  }

  const headers = new Headers(localHeaders);
  if (consistentRead) {
    addConsistentReadHeader(headers);
  }

  return fetchWithCachedResponse(url, {
    headers,
    cache: fetchCache,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  }).then<T>(async (res) => {
    if (res.ok) return res.json();
    await consumeResponseBody(res);

    if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
    // the /items endpoint never returns 404, so if we get a 404
    // it means the edge config itself did not exist
    if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    if (res.cachedResponseBody !== undefined)
      return res.cachedResponseBody as T;
    throw new UnexpectedNetworkError(res);
  });
}

/**
 * Fetches all or a list of edge config items from the API
 */
export async function fetchEdgeConfigTrace(
  baseUrl: string,
  version: string,
  consistentRead: undefined | boolean,
  localHeaders: HeadersRecord,
  fetchCache: EdgeConfigClientOptions['cache'],
  timeoutMs: number | undefined,
): Promise<string> {
  const headers = new Headers(localHeaders);
  if (consistentRead) {
    addConsistentReadHeader(headers);
  }

  return fetchWithCachedResponse(`${baseUrl}/digest?version=${version}`, {
    headers,
    cache: fetchCache,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  }).then(async (res) => {
    if (res.ok) return res.json() as Promise<string>;
    await consumeResponseBody(res);

    if (res.cachedResponseBody !== undefined)
      return res.cachedResponseBody as string;
    throw new UnexpectedNetworkError(res);
  });
}

/**
 * Uses `MAX_SAFE_INTEGER` as minimum updated at timestamp to force
 * a request to the origin.
 */
function addConsistentReadHeader(headers: Headers): void {
  headers.set('x-edge-config-min-updated-at', `${Number.MAX_SAFE_INTEGER}`);
}

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
async function consumeResponseBody(res: Response): Promise<void> {
  await res.arrayBuffer();
}

export interface EdgeConfigClientOptions {
  /**
   * The stale-if-error response directive indicates that the cache can reuse a
   * stale response when an upstream server generates an error, or when the error
   * is generated locally - for example due to a connection error.
   *
   * Any response with a status code of 500, 502, 503, or 504 is considered an error.
   *
   * Pass a negative number, 0, or false to turn disable stale-if-error semantics.
   *
   * The time is supplied in seconds. Defaults to one week (`604800`).
   */
  staleIfError?: number | false;
  /**
   * In development, a stale-while-revalidate cache is employed as the default caching strategy.
   *
   * This cache aims to deliver speedy Edge Config reads during development, though it comes
   * at the cost of delayed visibility for updates to Edge Config. Typically, you may need to
   * refresh twice to observe these changes as the stale value is replaced.
   *
   * This cache is not used in preview or production deployments as superior optimisations are applied there.
   */
  disableDevelopmentCache?: boolean;

  /**
   * Sets a `cache` option on the `fetch` call made by Edge Config.
   *
   * Unlike Next.js, this defaults to `no-store`, as you most likely want to use Edge Config dynamically.
   */
  cache?: 'no-store' | 'force-cache';

  /**
   * How long to wait for a fresh value before falling back to a stale value or throwing.
   *
   * It is recommended to only use this in combination with a bundled Edge Config (see "edge-config prepare" script).
   */
  timeoutMs?: number;
}
