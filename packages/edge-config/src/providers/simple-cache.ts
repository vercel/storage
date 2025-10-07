import { LRUCache } from 'lru-cache';
import type {
  EdgeConfigFunctionsOptions,
  EdgeConfigItems,
  EdgeConfigValue,
} from '../types';
import type { EdgeConfigProvider, Item, Items } from './interface';

export class SimpleCacheProvider implements EdgeConfigProvider {
  constructor(public readonly next: EdgeConfigProvider) {}

  private cache = new LRUCache({
    // TODO: dunno
    max: 1000,
    ttl: 1000 * 10,
  });

  async get<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Item<T>> {
    const cached = this.cache.get(key);
    if (cached) {
      return {
        cache: 'HIT',
        ...cached,
      } as Item<T>;
    }

    const item = await this.next.get<T>(key, localOptions);
    this.cache.set(key, item);

    return item;
  }

  private readonly getAllKey = 'getAll';

  async getAll<T extends EdgeConfigItems>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Items<T>> {
    const cached = this.cache.get(this.getAllKey);
    if (cached) {
      return {
        cache: 'HIT',
        ...cached,
      } as Items<T>;
    }

    const items = await this.next.getAll<T>(localOptions);
    this.cache.set(this.getAllKey, items);

    return items;
  }

  async getMany<T extends EdgeConfigItems>(
    keys: string[],
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Items<T>> {
    const key = keys.join('|');

    const cached = this.cache.get(key);
    if (cached) {
      return {
        cache: 'HIT',
        ...cached,
      } as Items<T>;
    }

    const items = await this.next.getMany<T>(keys, localOptions);
    this.cache.set(key, items);

    return items;
  }

  async has<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Item<T>> {
    const cached = this.cache.get(key);
    if (cached) {
      return {
        cache: 'HIT',
        ...cached,
      } as Item<T>;
    }

    const item = await this.next.has<T>(key, localOptions);
    this.cache.set(key, item);

    return item;
  }
}
