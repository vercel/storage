require('jest-fetch-mock').enableMocks();
require('urlpattern-polyfill');

process.env.EDGE_CONFIG = 'https://edge-config.vercel.com/ecfg-1?token=token-1';
