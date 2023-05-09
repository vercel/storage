import { test, expect } from '@playwright/test';

test.describe('@vercel/edge-config', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  test('should work', async ({ page }) => {
    expect('pls add tests').toBe('pls add tests');
  });
});
