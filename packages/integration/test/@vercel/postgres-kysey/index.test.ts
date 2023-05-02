import { test, expect } from '@playwright/test';

test.describe('@vercel/postgres-kysely', () => {
  test('should work', async ({ page }) => {
    expect('pls add tests').toBe('pls add tests');
  });
});
