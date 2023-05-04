import { test, expect } from '@playwright/test';

test.describe('@vercel/edge-config', () => {
  test('should work', async ({ page }) => {
    expect('pls add tests').toBe('pls add tests');
  });
});
