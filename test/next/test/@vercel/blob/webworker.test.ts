import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';

const prefix =
  process.env.GITHUB_PR_NUMBER || crypto.randomBytes(10).toString('hex');

// This test broke with the upgrade to Next.js v16 of "test/next"
test.skip('web worker upload', async ({ browser }) => {
  const browserContext = await browser.newContext({
    extraHTTPHeaders: process.env.VERCEL_PROTECTION_BYPASS_HEADER
      ? {
          'x-vercel-protection-bypass':
            process.env.VERCEL_PROTECTION_BYPASS_HEADER,
        }
      : undefined,
  });
  await browserContext.addCookies([
    {
      name: 'clientUpload',
      value: process.env.BLOB_UPLOAD_SECRET ?? 'YOYOYOYO',
      path: '/',
      domain: (process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'localhost').replace(
        'https://',
        '',
      ),
    },
  ]);

  const page = await browserContext.newPage();

  const random = Math.floor(Math.random() * 10000) + 1;
  const fileName = `${prefix}-webworker-test${random}`;
  const fileContent = `created from a webworker${random}`;

  // Load the page with the specified search params
  await page.goto(
    `vercel/blob/app/client-webworker?fileName=${fileName}&fileContent=${fileContent}`,
  );

  // Click the upload button
  await page.click('button:has-text("Upload from WebWorker")');

  // Wait for the blob URL to appear
  const blobUrlElement = await page.waitForSelector('a#test-result');
  const blobUrl = await blobUrlElement.getAttribute('href');
  expect(blobUrl).toBeDefined();

  // fetch the blob URL from the test, not the page, and verify its content
  const res = await fetch(blobUrl!);
  const response = await res.text();
  expect(response).toBe(fileContent);
});

test.afterAll(async ({ request, extraHTTPHeaders }) => {
  // cleanup all files
  await request.delete(`vercel/blob/api/app/clean?prefix=${prefix}`, {
    headers: { ...extraHTTPHeaders },
  });
});
