import Link from 'next/link';
import { capitalizeFirstLetter } from '../utils';

export interface TestRunnerProps {
  apiOrPage: 'api' | 'page';
  directory: 'app' | 'pages';
  environment: 'node' | 'edge';
}

export async function PostgresTestRunner({
  apiOrPage,
  directory,
  environment,
}: TestRunnerProps): Promise<JSX.Element> {
  let message = '';
  let status = 'Failed';
  const url = getUrl({
    apiOrPage,
    directory,
    environment,
  });
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      status = 'Passed';
    }
    if (resp.headers.get('content-type')?.startsWith('application/json')) {
      message = JSON.stringify(await resp.json(), null, 2);
    } else {
      message = await resp.text();
      if (message.includes('html id="__next_error__"')) {
        status = 'Failed';
        throw new Error('Failed to render page');
      }
    }
  } catch (e) {
    if (
      typeof e === 'object' &&
      e !== null &&
      'message' in e &&
      typeof e.message === 'string'
    ) {
      message = `Failed: ${e.message}`;
    } else {
      message = `Failed: ${e as string}`;
    }
  }

  const summary = `Render Type: ${apiOrPage === 'api' ? 'API' : 'Page'}
Directory: ${directory}
Environment: ${capitalizeFirstLetter(environment)}
Status: ${status}
Link: `;

  return (
    <pre
      style={{
        maxHeight: '33vh',
        minHeight: 'max-content',
        overflow: 'scroll',
        border: '1px solid black',
        padding: '8px',
        backgroundColor: status === 'Passed' ? 'lightgreen' : 'lightcoral',
        margin: 0,
      }}
    >
      {summary}
      <Link href={url.toString()}>{url.toString()}</Link>
      <details>{message}</details>
    </pre>
  );
}

function getUrl({ apiOrPage, directory, environment }: TestRunnerProps): URL {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
  const trailingFragment = `vercel/postgres-kysely/${directory}/${environment}`;
  if (apiOrPage === 'api') {
    return new URL(`${base}/api/${trailingFragment}`, base);
  }
  return new URL(`${base}/${trailingFragment}`, base);
}
