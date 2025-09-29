import type { EdgeConfigValue, EmbeddedEdgeConfig } from '../types';

interface CacheEntry<T = EdgeConfigValue> {
  value: T | undefined;
  updatedAt: number;
  digest: string;
  exists: boolean;
}

export class CacheManager {
  private itemCache = new Map<string, CacheEntry>();
  private edgeConfigCache: EmbeddedEdgeConfig | null = null;

  setItem<T extends EdgeConfigValue>(
    key: string,
    value: T | undefined,
    updatedAt: number,
    digest: string,
    exists: boolean,
  ): void {
    const existing = this.itemCache.get(key);
    if (existing && existing.updatedAt >= updatedAt) return;
    this.itemCache.set(key, { value, updatedAt, digest, exists });
  }

  setEdgeConfig(next: EmbeddedEdgeConfig): void {
    if (!next.updatedAt) return;
    const existing = this.edgeConfigCache;
    if (existing && existing.updatedAt >= next.updatedAt) return;
    this.edgeConfigCache = next;
  }

  getItem<T extends EdgeConfigValue>(
    key: string,
    method: 'GET' | 'HEAD',
  ): CacheEntry<T> | null {
    const item = this.itemCache.get(key);
    const itemCacheEntry =
      method === 'GET' && item?.exists && item.value === undefined
        ? undefined
        : item;
    const cachedConfig = this.edgeConfigCache;

    if (itemCacheEntry && cachedConfig) {
      return itemCacheEntry.updatedAt >= cachedConfig.updatedAt
        ? (itemCacheEntry as CacheEntry<T>)
        : {
            digest: cachedConfig.digest,
            value: cachedConfig.items[key] as T,
            updatedAt: cachedConfig.updatedAt,
            exists: Object.hasOwn(cachedConfig.items, key),
          };
    }

    if (itemCacheEntry && !cachedConfig) {
      return itemCacheEntry as CacheEntry<T>;
    }

    if (!itemCacheEntry && cachedConfig) {
      return {
        value: cachedConfig.items[key] as T,
        updatedAt: cachedConfig.updatedAt,
        digest: cachedConfig.digest,
        exists: Object.hasOwn(cachedConfig.items, key),
      };
    }

    return null;
  }

  getEdgeConfig(): EmbeddedEdgeConfig | null {
    return this.edgeConfigCache;
  }
}
