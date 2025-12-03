export class EdgeConfigFetchTimeoutError extends Error {
  public method: string;
  public edgeConfigId: string;
  public key: string | string[] | undefined;

  constructor(
    edgeConfigId: string,
    method: string,
    key: string | string[] | undefined,
  ) {
    super(
      `@vercel/edge-config: read timed out for ${edgeConfigId} (${[
        method,
        key ? (Array.isArray(key) ? key.join(', ') : key) : '',
      ]
        .filter((x) => x !== '')
        .join(' ')})`,
    );
    this.name = 'EdgeConfigFetchTimeoutError';
    this.edgeConfigId = edgeConfigId;
    this.key = key;
    this.method = method;
  }
}
