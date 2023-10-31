import { NextResponse } from 'next/server';
import { parseConnectionString } from '@vercel/edge-config';

// export const runtime = 'edge';
const delay = (ms = 500): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function GET(): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const connectionString = parseConnectionString(process.env.EDGE_CONFIG!);

  if (!connectionString)
    return NextResponse.json({ error: 'missing connection string' });

  const websocket = new WebSocket(
    `wss://edge-config.vercel.com/websocket/connect?edgeConfigId=${connectionString.id}`,
    {
      // @ts-expect-error -- ok
      headers: { authorization: connectionString.token },
    }
  );

  let data = null;

  websocket.addEventListener('message', (event) => {
    console.log('Message received from server');
    console.log('Data', event.data);
    data = event.data;
  });

  websocket.addEventListener('open', () => {
    console.log("it's open");
    websocket.send('MESSAGE');
  });

  await delay(1000);
  console.log('closing now');
  websocket.close();

  return NextResponse.json({ data });

  // const keyForTest = await get<string>('keyForTest');
  // return NextResponse.json({ keyForTest });
}
