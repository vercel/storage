export function mockableImport<M>(path: string): Promise<M> {
  return import(path) as Promise<M>;
}
