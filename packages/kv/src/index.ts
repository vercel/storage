import { Redis } from '@upstash/redis';
import type { ScanCommandOptions, RedisConfigNodejs } from '@upstash/redis';

let _kv: Redis | null = null;
process.env.UPSTASH_DISABLE_TELEMETRY = '1';

export class VercelKV extends Redis {
  // This API is based on https://github.com/redis/node-redis#scan-iterator which is not supported in @upstash/redis
  /**
   * Same as `scan` but returns an AsyncIterator to allow iteration via `for await`.
   */
  async *scanIterator(options?: ScanCommandOptions): AsyncIterable<string> {
    let cursor = '0';
    let keys: string[];
    do {
      // eslint-disable-next-line no-await-in-loop -- [@vercel/style-guide@5 migration]
      [cursor, keys] = await this.scan(cursor, options);
      for (const key of keys) {
        yield key;
      }
    } while (cursor !== '0');
  }

  /**
   * Same as `hscan` but returns an AsyncIterator to allow iteration via `for await`.
   */
  async *hscanIterator(
    key: string,
    options?: ScanCommandOptions,
  ): AsyncIterable<string | number> {
    let cursor = '0';
    let items: (number | string)[];
    do {
      // eslint-disable-next-line no-await-in-loop -- [@vercel/style-guide@5 migration]
      [cursor, items] = await this.hscan(key, cursor, options);
      for (const item of items) {
        yield item;
      }
    } while (cursor !== '0');
  }

  /**
   * Same as `sscan` but returns an AsyncIterator to allow iteration via `for await`.
   */
  async *sscanIterator(
    key: string,
    options?: ScanCommandOptions,
  ): AsyncIterable<string | number> {
    let cursor = '0';
    let items: (number | string)[];
    do {
      // eslint-disable-next-line no-await-in-loop -- [@vercel/style-guide@5 migration]
      [cursor, items] = await this.sscan(key, cursor, options);
      for (const item of items) {
        yield item;
      }
    } while (cursor !== '0');
  }

  /**
   * Same as `zscan` but returns an AsyncIterator to allow iteration via `for await`.
   */
  async *zscanIterator(
    key: string,
    options?: ScanCommandOptions,
  ): AsyncIterable<string | number> {
    let cursor = '0';
    let items: (number | string)[];
    do {
      // eslint-disable-next-line no-await-in-loop -- [@vercel/style-guide@5 migration]
      [cursor, items] = await this.zscan(key, cursor, options);
      for (const item of items) {
        yield item;
      }
    } while (cursor !== '0');
  }
}

export function createClient(config: RedisConfigNodejs): VercelKV {
  return new VercelKV({
    // The Next.js team recommends no value or `default` for fetch requests's `cache` option
    // upstash/redis defaults to `no-store`, so we enforce `default`
    cache: 'default',
    enableAutoPipelining: true,
    ...config,
  });
}

// eslint-disable-next-line import/no-default-export -- [@vercel/style-guide@5 migration]
export default new Proxy(
  {},
  {
    get(target, prop, receiver) {
      if (prop === 'then' || prop === 'parse') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- [@vercel/style-guide@5 migration]
        return Reflect.get(target, prop, receiver);
      }

      if (!_kv) {
        if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
          throw new Error(
            '@vercel/kv: Missing required environment variables KV_REST_API_URL and KV_REST_API_TOKEN',
          );
        }
        // eslint-disable-next-line no-console -- [@vercel/style-guide@5 migration]
        console.warn(
          '\x1b[33m"The default export has been moved to a named export and it will be removed in version 1, change to import { kv }\x1b[0m"',
        );

        _kv = createClient({
          url: process.env.KV_REST_API_URL,
          token: process.env.KV_REST_API_TOKEN,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- [@vercel/style-guide@5 migration]
      return Reflect.get(_kv, prop);
    },
  },
) as VercelKV;

export const kv = new Proxy(
  {},
  {
    get(target, prop) {
      if (!_kv) {
        if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
          throw new Error(
            '@vercel/kv: Missing required environment variables KV_REST_API_URL and KV_REST_API_TOKEN',
          );
        }

        _kv = createClient({
          url: process.env.KV_REST_API_URL,
          token: process.env.KV_REST_API_TOKEN,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- [@vercel/style-guide@5 migration]
      return Reflect.get(_kv, prop);
    },
  },
) as VercelKV;
