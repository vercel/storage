import { test, expect } from '@playwright/test';

test.describe('@vercel/edge-config', () => {
  test.describe('app directory', () => {
    test.describe('client', () => {
      test.describe('page', () => {
        test('edge', async ({ page }) => {
          await page.goto('vercel/edge-config/app/edge');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- [@vercel/style-guide@5 migration]
          expect(JSON.parse(textContent!)).toEqual('valueForTest');
        });
        test('node', async ({ page }) => {
          await page.goto('vercel/edge-config/app/node');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- [@vercel/style-guide@5 migration]
          expect(JSON.parse(textContent!)).toEqual('valueForTest');
        });
        test('loader caching', async ({ page }) => {
          await page.goto('vercel/edge-config/app/dataloader');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- [@vercel/style-guide@5 migration]
          const parsed = JSON.parse(textContent!) as Record<string, unknown>;
          expect(parsed.callsBefore).toEqual(0);
          expect(parsed.callsMiddle).toEqual(1);

          if (page.url().startsWith('http://localhost')) {
            // there is no request context in dev, so we expect 2 calls
            // to have happened as there was no request-context based cache
            expect(parsed.callsAfter).toEqual(2);
          } else {
            // there is a request context in prod, so we expect 1 call
            // which means the request-context based cache was used
            expect(parsed.callsAfter).toEqual(1);
          }
        });
      });
    });
  });
});
