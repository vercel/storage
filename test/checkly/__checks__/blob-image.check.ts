import * as path from 'node:path';
import { BrowserCheck, CheckGroup } from 'checkly/constructs';

const group = new CheckGroup('422519', {
  name: 'Vercel Storage',
  activated: true,
  locations: ['us-east-1'],
  tags: ['store', 'kv', 'blob', 'postgres'],
  concurrency: 10,
  environmentVariables: [
    {
      key: 'URL',
      value: 'https://storage-rho.vercel.app',
    },
  ],
});

// eslint-disable-next-line no-new
new BrowserCheck('blob-image', {
  name: 'Browser Blob Image',
  frequency: 10, // minutes
  code: {
    entrypoint: path.join(__dirname, 'blob-image.spec.ts'),
  },
  group,
});
