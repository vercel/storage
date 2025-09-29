import { createEventSource, type EventSourceClient } from 'eventsource-client';
import type { EmbeddedEdgeConfig, Connection } from '../types';
import { pickNewestEdgeConfig } from './pick-newest-edge-config';

export class StreamManager {
  private stream: EventSourceClient | null = null;
  private connection: Connection;
  private onEdgeConfig: (edgeConfig: EmbeddedEdgeConfig) => void;

  constructor(
    connection: Connection,
    onEdgeConfig: (edgeConfig: EmbeddedEdgeConfig) => void,
  ) {
    this.connection = connection;
    this.onEdgeConfig = onEdgeConfig;
  }

  async init(
    preloadPromise: Promise<EmbeddedEdgeConfig | null>,
    getEdgeConfig: () => EmbeddedEdgeConfig | null,
  ): Promise<void> {
    const preloadedEdgeConfig = await preloadPromise;
    const instanceEdgeConfig = getEdgeConfig();

    const edgeConfig = pickNewestEdgeConfig([
      preloadedEdgeConfig,
      instanceEdgeConfig,
    ]);

    this.stream = createEventSource({
      url: `https://api.vercel.com/v1/edge-config/${this.connection.id}/stream`,
      headers: {
        Authorization: `Bearer ${this.connection.token}`,
        ...(edgeConfig?.updatedAt
          ? { 'x-edge-config-updated-at': String(edgeConfig.updatedAt) }
          : {}),
      },
    });

    for await (const { data, event } of this.stream) {
      if (event === 'info' && data === 'token_invalidated') {
        this.stream.close();
        return;
      }

      if (event === 'embed') {
        try {
          const parsedEdgeConfig = JSON.parse(data) as EmbeddedEdgeConfig;
          this.onEdgeConfig(parsedEdgeConfig);
        } catch (e) {
          // eslint-disable-next-line no-console -- intentional error logging
          console.error(
            '@vercel/edge-config: Error parsing streamed edge config',
            e,
          );
        }
      }
    }

    this.stream.close();
  }

  close(): void {
    this.stream?.close();
  }
}
