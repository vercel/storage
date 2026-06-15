const path = require('node:path');

// `@vercel/oidc` pulls in `jose` transitively (via `verifyVercelOidcToken`,
// which Blob never calls). `jose` ships an ESM-only browser build that the
// jsdom and edge-runtime jest environments resolve and then fail to parse
// ("Unexpected token 'export'"), since jest doesn't transform node_modules.
// Blob doesn't use `jose` directly, so pin it to its CJS build in every test
// environment. Resolved via `@vercel/oidc` because `jose` isn't a direct
// dependency of this package under pnpm's strict layout.
const josePath = require.resolve('jose', {
  paths: [path.dirname(require.resolve('@vercel/oidc'))],
});

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testEnvironmentOptions: {
    url: 'http://localhost:3000',
  },
  moduleNameMapper: {
    '^jose$': josePath,
  },
};
