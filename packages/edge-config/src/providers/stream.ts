import type {
  EmbeddedEdgeConfig,
  EdgeConfigValue,
  EdgeConfigFunctionsOptions,
} from '../types';
import type { Connection } from '../utils/connection';
import { StreamManager } from '../utils/stream-manager';
import type { EdgeConfigProvider } from './interface';

export class StreamProvider implements EdgeConfigProvider {
  private streamedEdgeConfig: EmbeddedEdgeConfig | undefined;
  private streamManager: StreamManager | undefined;

  constructor(
    public readonly next: EdgeConfigProvider,
    {
      connection,
      enableStream,
    }: { connection: Connection; enableStream: boolean },
  ) {
    if (!enableStream || connection.type !== 'vercel') {
      return;
    }

    this.streamManager = new StreamManager(connection, (edgeConfig) => {
      this.streamedEdgeConfig = edgeConfig;
    });

    void this.streamManager.init().catch((error) => {
      // eslint-disable-next-line no-console -- intentional error logging
      console.error('@vercel/edge-config: Stream error', error);
    });
  }

  async get<T extends EdgeConfigValue>(
    key: string,
    localOptions?: EdgeConfigFunctionsOptions,
  ): Promise<Item<T>> {
    const edgeConfig = this.streamManager;

    return this.next.get<T>(key, localOptions);
  }
}
