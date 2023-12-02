import type { createLoaders } from './utils/create-loaders';

export interface RequestContextStore {
  get: () => RequestContext;
}

export interface RequestContext {
  headers: Record<string, string | undefined>;
  url: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export type Loaders = ReturnType<typeof createLoaders>;
