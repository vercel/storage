import { test, expect } from '@playwright/test';

test('Should load an image from a blob', async ({ page, request }) => {
  const response = await page.goto(
    `${process.env.URL ?? ''}/vercel/pages/blob/image`,
  );
  expect(response?.status()).toBeLessThan(400);
  await page.screenshot({ path: 'screenshot.jpg' });
  await request.delete(
    `${
      process.env.URL ?? ''
    }/vercel/blob/api/app/clean?prefix=checkly-scheduled-blob`,
  );
});
