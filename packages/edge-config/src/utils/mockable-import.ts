export function readLocalEdgeConfig<M>(id: string): Promise<M> {
  // The build process creates a __glob mechanism that expects this relative path
  // This works both in development and when installed as a dependency
  return import(`../../stores/${id}.json`) as Promise<M>;
}
