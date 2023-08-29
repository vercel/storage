import { test, expect } from '@playwright/test';

const expectedRows = [
  {
    id: 1,
    name: 'Guillermo Rauch',
    email: 'rauchg@vercel.com',
    image:
      'https://pbs.twimg.com/profile_images/1576257734810312704/ucxb4lHy_400x400.jpg',
    created_at: null,
  },
  {
    id: 2,
    name: 'Lee Robinson',
    email: 'lee@vercel.com',
    image:
      'https://pbs.twimg.com/profile_images/1587647097670467584/adWRdqQ6_400x400.jpg',
    created_at: null,
  },
  {
    id: 3,
    name: 'Steven Tey',
    email: 'stey@vercel.com',
    image:
      'https://pbs.twimg.com/profile_images/1506792347840888834/dS-r50Je_400x400.jpg',
    created_at: null,
  },
];

test.describe('@vercel/postgres', () => {
  test.describe('app directory', () => {
    test.describe('client', () => {
      test.describe('api', () => {
        test('edge', async ({ request }) => {
          const res = await request.get('api/vercel/postgres/app/client/edge');
          expect(await res.json()).toEqual(expectedRows);
        });
        test('node', async ({ request }) => {
          const res = await request.get('api/vercel/postgres/app/client/node');
          expect(await res.json()).toEqual(expectedRows);
        });
      });
      test.describe('page', () => {
        test('edge', async ({ page }) => {
          await page.goto('vercel/postgres/app/client/edge');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- [@vercel/style-guide@5 migration]
          expect(JSON.parse(textContent!)).toEqual(expectedRows);
        });
        test('node', async ({ page }) => {
          await page.goto('vercel/postgres/app/client/node');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- [@vercel/style-guide@5 migration]
          expect(JSON.parse(textContent!)).toEqual(expectedRows);
        });
      });
    });
    test.describe('pool', () => {
      test.describe('api', () => {
        test('edge', async ({ request }) => {
          const res = await request.get('api/vercel/postgres/app/pool/edge');
          expect(await res.json()).toEqual(expectedRows);
        });
        test('node', async ({ request }) => {
          const res = await request.get('api/vercel/postgres/app/pool/node');
          expect(await res.json()).toEqual(expectedRows);
        });
      });
      test.describe('page', () => {
        test('edge', async ({ page }) => {
          await page.goto('vercel/postgres/app/pool/edge');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- [@vercel/style-guide@5 migration]
          expect(JSON.parse(textContent!)).toEqual(expectedRows);
        });
        test('node', async ({ page }) => {
          await page.goto('vercel/postgres/app/pool/node');
          await expect(page.locator('html#__next_error__')).toHaveCount(0);
          const textContent = await page.locator('pre').textContent();
          expect(textContent).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- [@vercel/style-guide@5 migration]
          expect(JSON.parse(textContent!)).toEqual(expectedRows);
        });
      });
    });
  });
  test.describe('pages directory', () => {
    test.describe('client', () => {
      test('edge', async ({ request }) => {
        const res = await request.get('api/vercel/postgres/pages/client/edge');
        expect(await res.json()).toEqual(expectedRows);
      });
      test('node', async ({ request }) => {
        const res = await request.get('api/vercel/postgres/pages/client/node');
        expect(await res.json()).toEqual(expectedRows);
      });
    });
    test.describe('pool', () => {
      test('edge', async ({ request }) => {
        const res = await request.get('api/vercel/postgres/pages/pool/edge');
        expect(await res.json()).toEqual(expectedRows);
      });
      test('node', async ({ request }) => {
        const res = await request.get('api/vercel/postgres/pages/pool/node');
        expect(await res.json()).toEqual(expectedRows);
      });
    });
  });
});
