import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { type BlobResult } from '@vercel/blob';

const prefix = `${
  process.env.GITHUB_PR_NUMBER || crypto.randomBytes(10).toString('hex')
}`;

test.describe('@vercel/blob', () => {
  test.describe('api', () => {
    [
      'vercel/blob/api/app/body/edge',
      'vercel/blob/api/app/body/serverless',
      'api/vercel/blob/pages/edge',
      'api/vercel/blob/pages/serverless',
    ].forEach((path) => {
      test(path, async ({ request }) => {
        const data = (await request
          .post(`${path}?filename=${prefix}/test.txt`, {
            data: `Hello world ${path} ${prefix}`,
          })
          .then((r) => r.json())) as BlobResult;
        expect(data.contentDisposition).toBe('attachment; filename="test.txt"');
        expect(data.contentType).toBe('text/plain');
        expect(data.pathname).toBe(`${prefix}/test.txt`);
        const content = await request.get(data.url).then((r) => r.text());
        expect(content).toBe(`Hello world ${path} ${prefix}`);
      });
    });
  });
  test.describe('page', () => {
    test('serverless', async ({ page }) => {
      await page.goto(`vercel/pages/blob?filename=${prefix}/test-page.txt`);
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe(`${prefix}/test-page.txt`);
      expect(await page.locator('#blob-content').textContent()).toBe(
        `Hello from ${prefix}/test-page.txt`,
      );
    });
  });

  test.describe('app', () => {
    test('edge', async ({ page }) => {
      await page.goto(
        `vercel/blob/app/test/edge?filename=${prefix}/test-app-edge.txt`,
      );
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe(`${prefix}/test-app-edge.txt`);
      expect(await page.locator('#blob-content').textContent()).toBe(
        `Hello from ${prefix}/test-app-edge.txt`,
      );
    });
    test('serverless', async ({ page }) => {
      await page.goto(
        `vercel/blob/app/test/serverless?filename=${prefix}/test-app-serverless.txt`,
      );
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe(`${prefix}/test-app-serverless.txt`);
      expect(await page.locator('#blob-content').textContent()).toBe(
        `Hello from ${prefix}/test-app-serverless.txt`,
      );
    });
    test('client sign serverless', async ({ page }) => {
      await page.goto(
        `vercel/blob/app/test/client?filename=${prefix}/test-app-client.txt&callback=/vercel/blob/api/app/handle-blob-upload/serverless`,
      );
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe(`${prefix}/test-app-client.txt`);
      expect(await page.locator('#blob-content').textContent()).toBe(
        `Hello from ${prefix}/test-app-client.txt`,
      );
    });

    test('client sign edge', async ({ page }) => {
      await page.goto(
        `vercel/blob/app/test/client?filename=${prefix}/test-app-client.txt&callback=/vercel/blob/api/app/handle-blob-upload/edge`,
      );
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe(`${prefix}/test-app-client.txt`);
      expect(await page.locator('#blob-content').textContent()).toBe(
        `Hello from ${prefix}/test-app-client.txt`,
      );
    });

    test('client sign edge page', async ({ page }) => {
      await page.goto(
        `vercel/blob/app/test/client?filename=${prefix}/test-app-client.txt&callback=/api/vercel/blob/pages/handle-blob-upload-edge`,
      );
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe(`${prefix}/test-app-client.txt`);
      expect(await page.locator('#blob-content').textContent()).toBe(
        `Hello from ${prefix}/test-app-client.txt`,
      );
    });
    test('client sign serverless page', async ({ page }) => {
      await page.goto(
        `vercel/blob/app/test/client?filename=${prefix}/test-app-client.txt&callback=/api/vercel/blob/pages/handle-blob-upload-serverless`,
      );
      const textContent = await page.locator('#blob-path').textContent();
      expect(textContent).toBe(`${prefix}/test-app-client.txt`);
      expect(await page.locator('#blob-content').textContent()).toBe(
        `Hello from ${prefix}/test-app-client.txt`,
      );
    });
  });

  test.afterAll(async ({ request }) => {
    // cleanup all files
    await request.delete(`vercel/blob/api/app/clean?prefix=${prefix}`);
  });
});
