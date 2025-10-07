import type {
  CacheStatus,
  EdgeConfigFunctionsOptions,
  EdgeConfigItems,
  EdgeConfigValue,
} from '../types';

export interface Item<T extends EdgeConfigValue> {
  value: T | undefined;
  digest: string;
  cache: CacheStatus;
  updatedAt: number;
  exists: boolean;
}

export interface Items<T extends EdgeConfigItems> {
  value: T | undefined;
  digest: string;
  cache: CacheStatus;
  updatedAt: number;
}

export interface EdgeConfigProvider {
  get: <T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ) => Promise<Item<T>>;
  getAll: <T extends EdgeConfigItems>(
    localOptions?: EdgeConfigFunctionsOptions,
  ) => Promise<Items<T>>;
  getMany: <T extends EdgeConfigItems>(
    keys: string[],
    localOptions?: EdgeConfigFunctionsOptions,
  ) => Promise<Items<T>>;
  has: <T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ) => Promise<Item<T>>;

  // next provider in the chain
  next?: EdgeConfigProvider;
}
