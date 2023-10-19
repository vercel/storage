import { Suspense } from 'react';
import type { TestRunnerProps } from '@/lib/test/postgres';
import { EdgeConfigTestRunner } from '@/lib/test/edge-config';
import { ProjectDashboardLayout } from '@/lib/test/project-dashboard-layout';

export default function Page(): JSX.Element {
  const tests: TestRunnerProps[] = [
    {
      apiOrPage: 'page',
      connectionType: 'client',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'page',
      connectionType: 'client',
      directory: 'app',
      environment: 'node',
    },
  ];

  return (
    <ProjectDashboardLayout>
      {tests.map((matrix) => (
        <Suspense fallback={<pre>Loading...</pre>} key={JSON.stringify(matrix)}>
          <EdgeConfigTestRunner {...matrix} />
        </Suspense>
      ))}
    </ProjectDashboardLayout>
  );
}
