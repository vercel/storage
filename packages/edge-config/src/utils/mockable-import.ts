export function readLocalEdgeConfig<M>(id: string): Promise<M> {
  console.log('reading local edge config1', __dirname);
  // The build process creates a __glob mechanism that expects this relative path
  // This works both in development and when installed as a dependency
  return import(`@vercel/edge-config/stores/${id}.json`) as Promise<M>;
}
