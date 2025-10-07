import type {
  EdgeConfigFunctionsOptions,
  EdgeConfigItems,
  EdgeConfigValue,
} from '../types';
import type { NetworkClient } from '../utils/network-client';
import type { EdgeConfigProvider, Item, Items } from './interface';

export class OriginProvider implements EdgeConfigProvider {
  constructor(private readonly networkClient: NetworkClient) {}

  async get<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Item<T>> {
    const result = await this.networkClient.fetchItem<T>(
      'GET',
      key,
      localOptions,
    );

    return {
      cache: 'MISS',
      value: result.value,
      digest: result.digest,
      exists: result.exists,
      updatedAt: result.updatedAt,
    };
  }

  async getAll<T extends EdgeConfigItems>(
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Items<T>> {
    const result = await this.networkClient.fetchFullConfig<T>(localOptions);
    return {
      cache: 'MISS',
      value: result.items as T,
      digest: result.digest,
      updatedAt: result.updatedAt,
    };
  }

  async getMany<T extends EdgeConfigItems>(
    keys: string[],
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Items<T>> {
    const result = await this.networkClient.fetchMultipleItems<T>(
      keys,
      localOptions,
    );
    return {
      cache: 'MISS',
      value: result.value,
      digest: result.digest,
      updatedAt: result.updatedAt,
    };
  }

  async has<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Item<T>> {
    const result = await this.networkClient.fetchItem<T>(
      'HEAD',
      key,
      localOptions,
    );

    return {
      cache: 'MISS',
      value: result.value as T,
      digest: result.digest,
      exists: result.exists,
      updatedAt: result.updatedAt,
    };
  }
}
