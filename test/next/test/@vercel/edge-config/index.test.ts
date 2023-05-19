import { test, expect } from '@playwright/test';

test.describe('@vercel/edge-config', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  test('should work', async ({ page }) => {
    expect('pls add tests').toBe('pls add tests');
  });
});

// TODO enable once EDGE_CONFIG setup is done
test.skip('@vercel/edge-config', () => {
  test.describe('app directory', () => {
    test.describe('client', () => {
      test.describe('page', () => {
        test('edge', async ({ page }) => {
          await page.goto('vercel/edge-config/app/edge');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          expect(JSON.parse(textContent!)).toEqual('valueForTest');
        });
        test('node', async ({ page }) => {
          await page.goto('vercel/edge-config/app/node');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          expect(JSON.parse(textContent!)).toEqual('valueForTest');
        });
      });
    });
  });
});
