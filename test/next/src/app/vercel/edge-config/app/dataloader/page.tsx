import http from 'node:http';
import { performance } from 'node:perf_hooks';
import type { AddressInfo } from 'node:net';
import { createClient } from '@vercel/edge-config';
import enableDestroy from 'server-destroy';

export default async function Page(): Promise<JSX.Element> {
  let calls = 0;
  let resolveRunning: ((value: number) => void) | null = null;
  const running = new Promise<number>((r) => {
    resolveRunning = r;
  });
  const server = http
    .createServer((req, res) => {
      calls++;
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify([Date.now(), calls], null, 3));
    })
    .listen(0, 'localhost', () => {
      const address = server.address();
      if (address && typeof address !== 'string' && resolveRunning) {
        resolveRunning(address.port);
      }
    });

  await running;

  const { port } = server.address() as AddressInfo;

  // the client is created within the request as we need to know the port
  // but creating the client within the request means the caching will
  // automatically be reset per request, so we can not test this reset here.
  // we can only test that it caches within a request.
  const localClient = createClient(
    `http://localhost:${port}/ecfg_fake?token=fake-token&version=1`,

    {
      // disable disableDevelopmentCache so we can test behavior without
      // request context in async local storage (basically non-vercel deployments)
      disableDevelopmentCache: true,
    },
  );

  enableDestroy(server);

  const callsBefore = calls;
  performance.mark('A');
  const value1 = await localClient.get('someKey');
  performance.mark('B');

  const callsMiddle = calls;

  performance.mark('C');
  const value2 = await localClient.get('someKey');
  performance.mark('D');
  const callsAfter = calls;

  await new Promise((resolve) => {
    server.destroy(() => {
      resolve(null);
    });
  });

  return (
    <pre>
      {JSON.stringify(
        {
          value1,
          value2,
          callsBefore,
          callsMiddle,
          callsAfter,
          duration1Ms: performance.measure('A to B', 'A', 'B').duration,
          duration2Ms: performance.measure('C to D', 'C', 'D').duration,
        },
        null,
        2,
      )}
    </pre>
  );
}
