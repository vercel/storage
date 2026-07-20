require('jest-fetch-mock').enableMocks();

process.env.EDGE_CONFIG = 'https://edge-config.vercel.com/ecfg-1?token=token-1';
process.env.VERCEL_ENV = 'test';

// Adds a DOMException polyfill
//
// The polyfill is necessary to use AbortController in node v16 by our tests.
// AbortController itself is used when calling fetchMock.mockAbortOnce().
if (!globalThis.DOMException) {
  require('node-domexception');
}
