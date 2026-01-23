import { statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { UploadProgressEvent } from '@vercel/blob';

// TODO: Re-enable once we debug why uploads fail in CI (they were originally skipped)
test.describe
  .skip('progress events', () => {
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
            value: process.env.BLOB_UPLOAD_SECRET ?? '',
            path: '/',
            domain: (
              process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'localhost'
            ).replace('https://', ''),
          },
        ]);

        const page = await browserContext.newPage();
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
        await expect(page.getByTestId('progress-events')).toBeVisible();
        const progressEvents = await page
          .getByTestId('progress-event-item')
          .all();
        expect(progressEvents.length).toBeGreaterThan(2);

        // Verify first event (0%)
        const firstEventText = await progressEvents[0].textContent();
        const firstEvent = JSON.parse(
          firstEventText || '{}',
        ) as UploadProgressEvent;
        expect(firstEvent.loaded).toBe(0);
        expect(firstEvent.total).toBe(sizeInBytes);
        expect(firstEvent.percentage).toBe(0);

        // Verify second event (>0%)
        const secondEventText = await progressEvents[1].textContent();
        const secondEvent = JSON.parse(
          secondEventText || '{}',
        ) as UploadProgressEvent;
        expect(secondEvent.loaded).toBeGreaterThan(0);
        expect(secondEvent.total).toBe(sizeInBytes);
        expect(secondEvent.percentage).toBeGreaterThan(0);

        // Verify last event (100%)
        const lastEventText =
          await progressEvents[progressEvents.length - 1].textContent();
        const lastEvent = JSON.parse(
          lastEventText || '{}',
        ) as UploadProgressEvent;
        expect(lastEvent.loaded).toBe(sizeInBytes);
        expect(lastEvent.total).toBe(sizeInBytes);
        expect(lastEvent.percentage).toBe(100);
      });
    });
  });
