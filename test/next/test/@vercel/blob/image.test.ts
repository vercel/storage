import { test, expect } from '@playwright/test';

test.describe('@vercel/blob', () => {
  test.describe('page', () => {
    test('serverless', async ({ page }) => {
      await page.goto('vercel/pages/blob/image');
      await expect(page).toHaveScreenshot();
    });
  });
});
