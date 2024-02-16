import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';

const prefix =
  process.env.GITHUB_PR_NUMBER || crypto.randomBytes(10).toString('hex');

test.describe('@vercel/blob', () => {
  test.describe('page', () => {
    test('serverless', async ({ page }) => {
      // eslint-disable-next-line no-console -- [@vercel/style-guide@5 migration]
      console.log(`vercel/pages/blob/image?prefix=${prefix}`);
      const response = await page.goto(
        `vercel/pages/blob/image?prefix=${prefix}`,
      );
      await expect(page).toHaveScreenshot('blob-image.png');
      expect(response?.status()).toBe(200);
    });
  });
  test.afterAll(async ({ request }) => {
    // cleanup all files
    await request.delete(`vercel/blob/api/app/clean?prefix=${prefix}`);
  });
});
