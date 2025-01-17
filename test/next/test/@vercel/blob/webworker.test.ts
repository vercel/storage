import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';

const prefix =
  process.env.GITHUB_PR_NUMBER || crypto.randomBytes(10).toString('hex');

test('web worker upload', async ({ page }) => {
  const fileName = `${prefix}-webworker-test`;
  const fileContent = 'created from a webworker';

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

test.afterAll(async ({ request }) => {
  // cleanup all files
  await request.delete(`vercel/blob/api/app/clean?prefix=${prefix}`);
});