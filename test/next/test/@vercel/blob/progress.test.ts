import { statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { UploadProgressEvent } from '@vercel/blob';

test.describe('progress events', () => {
  ['multipart=0', 'multipart=1'].forEach((searchParams) => {
    test(`onUploadProgress client upload ${searchParams}`, async ({
      browser,
    }) => {
      // Increase test timeout for 15MB upload
      test.setTimeout(180000);
      // Create a temporary test file
      const testFilePath = join(
        __dirname,
        '..',
        '..',
        '..',
        'public',
        '15mb-video.mp4',
      );

      const sizeInBytes = statSync(testFilePath).size;

      // Don't use extraHTTPHeaders here - it applies to ALL requests including
      // cross-origin blob API calls, which breaks CORS. Instead use page.route()
      // to add the header only to preview deployment requests.
      const browserContext = await browser.newContext();
      await browserContext.addCookies([
        {
          name: 'clientUpload',
          value: process.env.BLOB_UPLOAD_SECRET ?? '',
          path: '/',
          domain: (process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'localhost').replace(
            'https://',
            '',
          ),
        },
      ]);

      const page = await browserContext.newPage();

      // Add protection bypass header only for requests to the preview deployment
      if (process.env.VERCEL_PROTECTION_BYPASS_HEADER) {
        const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL ?? '';
        await page.route(`${baseUrl}/**`, async (route) => {
          const headers = {
            ...route.request().headers(),
            'x-vercel-protection-bypass':
              process.env.VERCEL_PROTECTION_BYPASS_HEADER!,
          };
          await route.continue({ headers });
        });
      }

      await page.goto(`vercel/blob/app/client?${searchParams}`);

      // Get the file input and set the file
      const fileInput = page.getByTestId('file-input');
      await fileInput.setInputFiles(testFilePath);

      // Click the upload button
      await page.getByTestId('upload-button').click();

      // Wait for the blob result to appear and verify URL
      const blobUrl = page.getByTestId('blob-url');
      await expect(blobUrl).toBeVisible({ timeout: 150000 });
      const url = await blobUrl.getAttribute('href');
      expect(url).toBeDefined();
      expect(url).toContain('15mb-video');
      expect(url).toContain('.mp4');

      // Verify video player is present
      await expect(page.getByTestId('video-player')).toBeVisible();

      // Wait for and verify progress events
      // Use toPass() for polling because in Firefox the DOM might not have
      // all progress events rendered immediately after they become visible
      await expect(page.getByTestId('progress-events')).toBeVisible();

      await expect(async () => {
        const progressEvents = await page
          .getByTestId('progress-event-item')
          .all();
        expect(progressEvents.length).toBeGreaterThan(2);

        // Parse all events
        const events: UploadProgressEvent[] = [];
        for (const el of progressEvents) {
          const text = await el.textContent();
          events.push(JSON.parse(text || '{}') as UploadProgressEvent);
        }

        // Verify first event (0%)
        expect(events[0].loaded).toBe(0);
        expect(events[0].total).toBe(sizeInBytes);
        expect(events[0].percentage).toBe(0);

        // Verify there's at least one intermediate event with loaded > 0
        // In Firefox multipart mode, the first few events might all have loaded=0
        // before actual progress is reported, so we look for ANY event with progress
        const hasIntermediateProgress = events
          .slice(1, -1)
          .some((e) => e.loaded > 0 && e.loaded < sizeInBytes);
        expect(hasIntermediateProgress).toBe(true);

        // Verify last event (100%)
        const lastEvent = events[events.length - 1];
        expect(lastEvent.loaded).toBe(sizeInBytes);
        expect(lastEvent.total).toBe(sizeInBytes);
        expect(lastEvent.percentage).toBe(100);
      }).toPass({ timeout: 30000 });
    });
  });
});
