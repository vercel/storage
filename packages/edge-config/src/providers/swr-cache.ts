import type { EdgeConfigFunctionsOptions, EdgeConfigValue } from '../types';
import type { CacheManager } from '../utils/cache-manager';
import type { Connection } from '../utils/connection';
import type { EdgeConfigProvider, Item } from './interface';

export class SWRCacheProvider implements EdgeConfigProvider {
  constructor(
    public readonly next: EdgeConfigProvider,
    private readonly cacheManager: CacheManager,
    private readonly connection: Connection,
  ) {}

  async get<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Item<T>> {
    return this.next.get<T>(key, localOptions);
  }
}
