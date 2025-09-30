import {
  createEventSource,
  type EventSourceClient,
  type FetchLike,
} from 'eventsource-client';
import type { EmbeddedEdgeConfig, Connection } from '../types';
import { pickNewestEdgeConfig } from './pick-newest-edge-config';

export class StreamManager {
  private stream: EventSourceClient | null = null;
  private connection: Connection;
  private onEdgeConfig: (edgeConfig: EmbeddedEdgeConfig | null) => void;
  private onStreamAvailable: (available: boolean) => void;

  constructor(
    connection: Connection,
    onEdgeConfig: (edgeConfig: EmbeddedEdgeConfig | null) => void,
    onStreamAvailable: (available: boolean) => void,
  ) {
    this.connection = connection;
    this.onEdgeConfig = onEdgeConfig;
    this.onStreamAvailable = onStreamAvailable;
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

    // TODO we can remove the custom fetch once eventstream-client supports
    // seeing the status code. We only need this to be able to stop retrying
    // on 401, 403, 404.
    const fetchKeepResponse = (): FetchLike & {
      status?: number;
      statusText?: string;
    } => {
      const f: FetchLike & { status?: number; statusText?: string } = async (
        url,
        fetchInit,
      ) => {
        f.status = undefined;
        f.statusText = undefined;
        const response = await fetch(url, fetchInit);
        f.status = response.status;
        f.statusText = response.statusText;
        return response;
      };
      return f;
    };

    const customFetch = fetchKeepResponse();

    this.stream = createEventSource({
      url: `https://api.vercel.com/v1/edge-config/${this.connection.id}/stream`,
      headers: {
        Authorization: `Bearer ${this.connection.token}`,
        ...(edgeConfig?.updatedAt
          ? { 'x-edge-config-updated-at': String(edgeConfig.updatedAt) }
          : {}),
      },
      fetch: customFetch,
      onConnect: () => {
        this.onStreamAvailable(true);
      },
      onDisconnect: () => {
        if (!customFetch.status || customFetch.status >= 400) {
          this.onStreamAvailable(false);
          this.onEdgeConfig(null);
          this.stream?.close();
        }
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
