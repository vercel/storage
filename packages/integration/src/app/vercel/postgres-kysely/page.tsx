import { Suspense } from 'react';
import type { TestRunnerProps } from '../../components/postgres-kysely-test-runner';
import { PostgresTestRunner } from '../../components/postgres-kysely-test-runner';
import { ProjectDashboardLayout } from '@/app/components/project-dashboard-layout';

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
          {/* @ts-expect-error - Async Server Component */}
          <PostgresTestRunner {...matrix} />
        </Suspense>
      ))}
    </ProjectDashboardLayout>
  );
}
