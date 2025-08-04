export function readLocalEdgeConfig<M>(id: string): Promise<M> {
  return import(`/tmp/edge-config/${id}.json`) as Promise<M>;
}
