import { Suspense } from 'react';
import {
  GlobalConfigTestRunner,
  type TestRunnerProps,
} from '@/lib/test/global-config';
import { ProjectDashboardLayout } from '@/lib/test/project-dashboard-layout';

export default function Page(): React.JSX.Element {
  const tests: TestRunnerProps[] = [
    {
      apiOrPage: 'page',
      directory: 'app',
      environment: 'edge',
    },
    {
      apiOrPage: 'page',
      directory: 'app',
      environment: 'node',
    },
  ];

  return (
    <ProjectDashboardLayout>
      {tests.map((matrix) => (
        <Suspense fallback={<pre>Loading...</pre>} key={JSON.stringify(matrix)}>
          <GlobalConfigTestRunner {...matrix} />
        </Suspense>
      ))}
    </ProjectDashboardLayout>
  );
}
