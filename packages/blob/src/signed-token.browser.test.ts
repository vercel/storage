import { webcrypto } from 'node:crypto';
import { registerPresignUrlTests } from './signed-token.presignurl.shared-spec';

// jsdom does not expose Web Crypto. Install Node's so `presignUrl` (HMAC) matches browsers.
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'crypto', {
      value: webcrypto,
      configurable: true,
      writable: true,
    });
  }
});

// Same suite as `signed-token.node.test.ts`, but under Jest's jsdom environment
registerPresignUrlTests('presignUrl (jsdom)');
