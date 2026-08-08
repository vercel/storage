import { defineTool } from 'eve/tools';
import { z } from 'zod';

import { BlobNotFoundError } from '../../src/api.js';
import { head } from '../../src/head.js';
import { blobCommandOptions } from '../lib/options.js';

export default defineTool({
  description:
    'Fetch metadata for a single blob by URL or pathname without downloading its contents. Returns found: false when the blob does not exist.',
  inputSchema: z.object({
    urlOrPathname: z.string().describe('Blob URL or pathname to inspect.'),
  }),
  async execute({ urlOrPathname }, ctx) {
    try {
      const result = await head(urlOrPathname, blobCommandOptions(ctx));

      return {
        url: result.url,
        downloadUrl: result.downloadUrl,
        pathname: result.pathname,
        size: result.size,
        contentType: result.contentType,
        contentDisposition: result.contentDisposition,
        cacheControl: result.cacheControl,
        uploadedAt: result.uploadedAt.toISOString(),
        etag: result.etag,
      };
    } catch (error) {
      // Mirror get: a missing blob is a recoverable result, not an error turn.
      if (error instanceof BlobNotFoundError) {
        return { found: false };
      }

      throw error;
    }
  },
});
