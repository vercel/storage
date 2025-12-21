import { name as sdkName, version as sdkVersion } from '../../package.json';
import type {
  Connection,
  EdgeConfigFunctionsOptions,
  EdgeConfigItems,
  EdgeConfigValue,
  EmbeddedEdgeConfig,
} from '../types';
import { consumeResponseBody } from './consume-response-body';
import { createEnhancedFetch } from './fetch-with-cached-response';
import { getMostRecentUpdateTimestamp, parseTs } from './timestamps';
import { after } from './after';
import { ERRORS, UnexpectedNetworkError } from './errors';

export class NetworkClient {
  private enhancedFetch: ReturnType<typeof createEnhancedFetch>;
  private connection: Connection;
  private cacheMode: 'no-store' | 'force-cache';

  constructor(connection: Connection, cacheMode: 'no-store' | 'force-cache') {
    this.connection = connection;
    this.cacheMode = cacheMode;
    this.enhancedFetch = createEnhancedFetch();
  }

  private getHeaders(
    localOptions: EdgeConfigFunctionsOptions | undefined,
    minUpdatedAt: number | null,
  ): Headers {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.connection.token}`,
    };
    const localHeaders = new Headers(headers);

    if (localOptions?.consistentRead || minUpdatedAt) {
      localHeaders.set(
        'x-edge-config-min-updated-at',
        `${localOptions?.consistentRead ? Number.MAX_SAFE_INTEGER : minUpdatedAt}`,
      );
    }

    if (process.env.VERCEL_ENV) {
      localHeaders.set('x-edge-config-vercel-env', process.env.VERCEL_ENV);
    }

    if (typeof sdkName === 'string' && typeof sdkVersion === 'string') {
      localHeaders.set('x-edge-config-sdk', `${sdkName}@${sdkVersion}`);
    }

    return localHeaders;
  }

  async fetchItem<T extends EdgeConfigValue>(
    method: 'GET' | 'HEAD',
    key: string,
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: T | undefined;
    digest: string;
    exists: boolean;
    updatedAt: number;
  }> {
    const [res, cachedRes] = await this.enhancedFetch(
      `${this.connection.baseUrl}/item/${key}?version=${this.connection.version}`,
      {
        method,
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    );

    const digest = (cachedRes || res).headers.get('x-edge-config-digest');
    const updatedAt = parseTs(
      (cachedRes || res).headers.get('x-edge-config-updated-at'),
    );

    if (
      res.status === 500 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504
    ) {
      await Promise.all([
        consumeResponseBody(res),
        cachedRes ? consumeResponseBody(cachedRes) : null,
      ]);
      throw new UnexpectedNetworkError(res);
    }

    if (!digest || !updatedAt) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);

    if (res.ok || (res.status === 304 && cachedRes)) {
      if (method === 'HEAD') {
        after(() =>
          Promise.all([
            consumeResponseBody(res),
            cachedRes ? consumeResponseBody(cachedRes) : null,
          ]),
        );
      } else if (res.status === 304) {
        after(() => consumeResponseBody(res));
      }

      let value: T | undefined;
      if (method === 'GET') {
        value = (await (
          res.status === 304 && cachedRes ? cachedRes : res
        ).json()) as T;
      }

      return {
        value,
        digest,
        exists: res.status !== 404,
        updatedAt,
      };
    }

    await Promise.all([
      consumeResponseBody(res),
      cachedRes ? consumeResponseBody(cachedRes) : null,
    ]);

    if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
    if (res.status === 404) {
      if (digest && updatedAt) {
        return {
          value: undefined,
          digest,
          exists: false,
          updatedAt,
        };
      }
      throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    }
    throw new UnexpectedNetworkError(res);
  }

  async fetchFullConfig<ItemsType extends Record<string, EdgeConfigValue>>(
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<EmbeddedEdgeConfig> {
    const [res, cachedRes] = await this.enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    );

    const digest = (cachedRes ?? res).headers.get('x-edge-config-digest');
    const updatedAt = parseTs(
      (cachedRes ?? res).headers.get('x-edge-config-updated-at'),
    );

    if (res.status === 500) throw new UnexpectedNetworkError(res);

    if (!updatedAt || !digest) {
      throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    }

    if (res.status === 401) {
      await consumeResponseBody(res);
      throw new Error(ERRORS.UNAUTHORIZED);
    }

    if (res.ok || (res.status === 304 && cachedRes)) {
      const value = (await (
        res.status === 304 && cachedRes ? cachedRes : res
      ).json()) as ItemsType;

      if (res.status === 304) await consumeResponseBody(res);

      return { items: value, digest, updatedAt };
    }

    throw new UnexpectedNetworkError(res);
  }

  async fetchMultipleItems<ItemsType extends EdgeConfigItems>(
    keys: string[],
    minUpdatedAt: number | null,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<{
    value: ItemsType;
    digest: string;
    updatedAt: number;
  }> {
    const search = new URLSearchParams(
      keys.map((key) => ['key', key] as [string, string]),
    ).toString();

    const [res, cachedRes] = await this.enhancedFetch(
      `${this.connection.baseUrl}/items?version=${this.connection.version}&${search}`,
      {
        headers: this.getHeaders(localOptions, minUpdatedAt),
        cache: this.cacheMode,
      },
    );

    const digest = (cachedRes || res).headers.get('x-edge-config-digest');
    const updatedAt = parseTs(
      (cachedRes || res).headers.get('x-edge-config-updated-at'),
    );

    if (!updatedAt || !digest) {
      throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    }

    if (res.ok || (res.status === 304 && cachedRes)) {
      if (!digest) {
        throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
      }
      const value = (await (
        res.status === 304 && cachedRes ? cachedRes : res
      ).json()) as ItemsType;

      return { value, digest, updatedAt };
    }
    await consumeResponseBody(res);

    if (res.status === 401) throw new Error(ERRORS.UNAUTHORIZED);
    if (res.status === 404) throw new Error(ERRORS.EDGE_CONFIG_NOT_FOUND);
    throw new UnexpectedNetworkError(res);
  }

  async fetchDigest(
    localOptions?: Pick<EdgeConfigFunctionsOptions, 'consistentRead'>,
  ): Promise<string> {
    const ts = getMostRecentUpdateTimestamp(this.connection);
    const res = await fetch(
      `${this.connection.baseUrl}/digest?version=${this.connection.version}`,
      {
        headers: this.getHeaders(localOptions, ts),
        cache: this.cacheMode,
      },
    );

    if (res.ok) return res.json() as Promise<string>;
    await consumeResponseBody(res);
    throw new UnexpectedNetworkError(res);
  }
}
