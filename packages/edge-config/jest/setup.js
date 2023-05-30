require('jest-fetch-mock').enableMocks();

process.env.EDGE_CONFIG = 'https://edge-config.vercel.com/ecfg-1?token=token-1';
process.env.VERCEL_ENV = 'test';
