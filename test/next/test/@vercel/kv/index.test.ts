import { test, expect } from '@playwright/test';

test.describe('@vercel/kv', () => {
  test('should work', async ({ page }) => {
    expect('pls add tests').toBe('pls add tests');
  });
});
