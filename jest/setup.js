require('jest-fetch-mock').enableMocks();

process.env.VERCEL_EDGE_CONFIG =
  'https://vercel-edge.com/edge-config/edgeConfigId1/secret1';
