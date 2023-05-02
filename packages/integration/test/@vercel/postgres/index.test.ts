import { test, expect } from '@playwright/test';

test.describe('@vercel/postgres', () => {
  test('should work', async ({ page }) => {
    expect('hi').toBe('hi');
  });
});
