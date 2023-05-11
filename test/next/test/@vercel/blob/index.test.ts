import { test, expect } from '@playwright/test';
import { type BlobResult } from '@vercel/blob';

test.describe('@vercel/kv', () => {
  test.describe('api', () => {
    [
      'vercel/blob/api/app/body/edge',
      'vercel/blob/api/app/body/serverless',
      'api/vercel/blob/edge',
      'api/vercel/blob/serverless',
    ].forEach((path) => {
      test(path, async ({ request }) => {
        const data = (await request
          .post(`${path}?filename=test.txt`, {
            data: 'Hello world',
          })
          .then((r) => r.json())) as BlobResult;
        expect(data.contentDisposition).toBe('attachment; filename="test.txt"');
        expect(data.contentType).toBe('text/plain');
        expect(data.pathname).toBe('test.txt');
      });
    });
  });
  test.describe('page', () => {
    test('serverless', async ({ page }) => {
      await page.goto('blob');
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe('test-page.txt');
    });
  });

  test.describe('app', () => {
    test('edge', async ({ page }) => {
      await page.goto('vercel/blob/app/test/edge');
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe('test-app-edge.txt');
    });
    test('serverless', async ({ page }) => {
      await page.goto('vercel/blob/app/test/serverless');
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe('test-app-serverless.txt');
    });
  });
});
