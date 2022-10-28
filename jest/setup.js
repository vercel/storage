require('jest-fetch-mock').enableMocks();
require('urlpattern-polyfill');

process.env.EDGE_CONFIG =
  'https://edge-config.vercel.com/config/ecfg-1?token=token-1';
