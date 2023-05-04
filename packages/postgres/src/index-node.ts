import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'server-only';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- neonConfig is undefined in the test environment... for some reason
if (neonConfig) {
  neonConfig.webSocketConstructor = ws;
}

export * from './index';
