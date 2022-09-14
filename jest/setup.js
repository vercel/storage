require('jest-fetch-mock').enableMocks();

process.env.VERCEL_EDGE_CONFIG =
  'edge-config://token-1@edge-config.vercel.com/ecfg-1';
