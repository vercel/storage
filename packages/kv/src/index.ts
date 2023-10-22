import { Redis, type RedisConfigNodejs } from '@upstash/redis';
import { type ScanCommandOptions } from '@upstash/redis/types/pkg/commands/scan';

let _kv: Redis | null = null;
process.env.UPSTASH_DISABLE_TELEMETRY = '1';

type Cursor = number;

export class VercelKV extends Redis {
  // This API is based on https://github.com/redis/node-redis#scan-iterator which is not supported in @upstash/redis

  // Implements async iteration logic for scan operations, allowing for idiomatic syntax in userland:
  // for await (const key of client.scanIterator()) { console.log(key) }
  private static async *toAsyncIterableScan<T>(
    scan: (cursor: Cursor) => Promise<[Cursor, T[]]>
  ): AsyncIterable<T> {
    let cursor = 0;
    let items: T[];
    do {
      // eslint-disable-next-line no-await-in-loop -- [@vercel/style-guide@5 migration]
      [cursor, items] = await scan(cursor);
      yield* items;
    } while (cursor !== 0);
  }

  async *scanIterator(options?: ScanCommandOptions): AsyncIterable<string> {
    yield* VercelKV.toAsyncIterableScan<string>((cursor) =>
      this.scan(cursor, options)
    );
  }

  async *hscanIterator(
    key: string,
    options?: ScanCommandOptions
  ): AsyncIterable<string | number> {
    yield* VercelKV.toAsyncIterableScan<string | number>((cursor) =>
      this.hscan(key, cursor, options)
    );
  }

  async *sscanIterator(
    key: string,
    options?: ScanCommandOptions
  ): AsyncIterable<string | number> {
    yield* VercelKV.toAsyncIterableScan<string | number>((cursor) =>
      this.sscan(key, cursor, options)
    );
  }

  async *zscanIterator(
    key: string,
    options?: ScanCommandOptions
  ): AsyncIterable<string | number> {
    yield* VercelKV.toAsyncIterableScan<string | number>((cursor) =>
      this.zscan(key, cursor, options)
    );
  }
}

export function createClient(config: RedisConfigNodejs): VercelKV {
  return new VercelKV(config);
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
            '@vercel/kv: Missing required environment variables KV_REST_API_URL and KV_REST_API_TOKEN'
          );
        }
        // eslint-disable-next-line no-console -- [@vercel/style-guide@5 migration]
        console.warn(
          '\x1b[33m"The default export has been moved to a named export and it will be removed in version 1, change to import { kv }\x1b[0m"'
        );

        _kv = createClient({
          url: process.env.KV_REST_API_URL,
          token: process.env.KV_REST_API_TOKEN,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- [@vercel/style-guide@5 migration]
      return Reflect.get(_kv, prop);
    },
  }
) as VercelKV;

export const kv = new Proxy(
  {},
  {
    get(target, prop) {
      if (!_kv) {
        if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
          throw new Error(
            '@vercel/kv: Missing required environment variables KV_REST_API_URL and KV_REST_API_TOKEN'
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
  }
) as VercelKV;
