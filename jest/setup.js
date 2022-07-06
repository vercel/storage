require('jest-fetch-mock').enableMocks();

process.env.VERCEL_EDGE_CONFIG =
  'https://vercel-edge-config.com/edgeConfigId1/secret1';
