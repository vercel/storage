import { Suspense } from 'react';
import type { TestRunnerProps } from '@/lib/test/postgres-kysely';
import { PostgresTestRunner } from '@/lib/test/postgres-kysely';
import { ProjectDashboardLayout } from '@/lib/test/project-dashboard-layout';

export default function Page(): JSX.Element {
  const tests: TestRunnerProps[] = [
    {
      apiOrPage: 'api',
      directory: 'app',
      environment: 'node',
    },
    {
      apiOrPage: 'api',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'page',
      directory: 'app',
      environment: 'node',
    },
    {
      apiOrPage: 'page',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'api',
      directory: 'pages',
      environment: 'node',
    },
    {
      apiOrPage: 'api',
      directory: 'pages',
      environment: 'edge',
    },
  ];

  return (
    <ProjectDashboardLayout>
      {tests.map((matrix) => (
        <Suspense fallback={<pre>Loading...</pre>} key={JSON.stringify(matrix)}>
          <PostgresTestRunner {...matrix} />
        </Suspense>
      ))}
    </ProjectDashboardLayout>
  );
}
