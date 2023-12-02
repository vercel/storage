import type {
  Loaders,
  RequestContext,
  RequestContextStore,
} from '../types-internal';
import { createLoaders } from './create-loaders';

export function getLoadersInstance(
  options: Parameters<typeof createLoaders>[0] & {
    disableRequestContextCache?: boolean;
  },
  loadersInstanceCache: WeakMap<RequestContext, Loaders>,
): ReturnType<typeof createLoaders> {
  if (options.disableRequestContextCache) return createLoaders(options);

  const requestContextStore =
    // @ts-expect-error -- this is a vercel primitive which might or might not be defined
    globalThis[Symbol.for('@vercel/request-context')] as
      | RequestContextStore
      | undefined;

  const requestContext = requestContextStore?.get();

  // if we have requestContext we can use dataloader to cache and batch per request
  if (requestContext) {
    const loadersInstance = loadersInstanceCache.get(requestContext);
    if (loadersInstance) return loadersInstance;

    const loaders = createLoaders(options);
    loadersInstanceCache.set(requestContext, loaders);
    return loaders;
  }

  // there is no requestConext so we can not cache loader instances per request,
  // so we return a new instance every time effectively disabling dataloader
  // batching and caching
  return createLoaders(options);
}
