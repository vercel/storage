import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (neonConfig) {
  neonConfig.webSocketConstructor = ws;
}

export * from './index';
