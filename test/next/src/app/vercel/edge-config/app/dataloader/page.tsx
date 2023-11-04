import http from 'node:http';
import { createClient } from '@vercel/edge-config';
import enableDestroy from 'server-destroy';

const port = 8303;

process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR = '1';

const localClient = createClient(
  `http://localhost:${port}/ecfg_fake?token=fake-token&version=1`,
);

export default async function Page(): Promise<JSX.Element> {
  process.env.EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR = '1';

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
    .listen(port, 'localhost', () => {
      const address = server.address();
      if (address && typeof address !== 'string' && resolveRunning) {
        resolveRunning(address.port);
      }
    });

  enableDestroy(server);

  await running;

  const callsBefore = calls;
  const value1 = await localClient.get('someKey');
  const callsMiddle = calls;

  const value2 = await localClient.get('someKey2');
  const callsAfter = calls;

  await new Promise((resolve) => {
    server.destroy(() => {
      resolve(null);
    });
  });

  return (
    <div>
      {JSON.stringify(
        { value1, value2, callsBefore, callsMiddle, callsAfter },
        null,
        2,
      )}
    </div>
  );
}
