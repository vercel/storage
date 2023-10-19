import { Suspense } from 'react';
import type { TestRunnerProps } from '@/lib/test/postgres';
import { PostgresTestRunner } from '@/lib/test/postgres';
import { ProjectDashboardLayout } from '@/lib/test/project-dashboard-layout';

export default function Page(): JSX.Element {
  const tests: TestRunnerProps[] = [
    {
      apiOrPage: 'api',
      connectionType: 'pool',
      directory: 'app',
      environment: 'node',
    },
    {
      apiOrPage: 'api',
      connectionType: 'pool',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'api',
      connectionType: 'client',
      directory: 'app',
      environment: 'node',
    },
    {
      apiOrPage: 'api',
      connectionType: 'client',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'page',
      connectionType: 'pool',
      directory: 'app',
      environment: 'node',
    },
    {
      apiOrPage: 'page',
      connectionType: 'pool',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'page',
      connectionType: 'client',
      directory: 'app',
      environment: 'node',
    },
    {
      apiOrPage: 'page',
      connectionType: 'client',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'api',
      connectionType: 'pool',
      directory: 'pages',
      environment: 'node',
    },
    {
      apiOrPage: 'api',
      connectionType: 'pool',
      directory: 'pages',
      environment: 'edge',
    },
    {
      apiOrPage: 'api',
      connectionType: 'client',
      directory: 'pages',
      environment: 'node',
    },
    {
      apiOrPage: 'api',
      connectionType: 'client',
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
