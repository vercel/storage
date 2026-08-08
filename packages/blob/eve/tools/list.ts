import { defineTool } from 'eve/tools';
import { z } from 'zod';

import { list } from '../../src/list.js';
import { blobCommandOptions } from '../lib/options.js';

export default defineTool({
  description:
    'List blobs in the Vercel Blob store. Returns blob metadata, pagination cursor, and optional folder names in folded mode.',
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .positive()
      .max(1000)
      .optional()
      .describe('Maximum blobs to return. Defaults to 1000.'),
    prefix: z
      .string()
      .optional()
      .describe('Only include blobs whose pathname starts with this prefix.'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous list response.'),
    mode: z
      .enum(['expanded', 'folded'])
      .optional()
      .describe(
        'expanded lists every blob; folded groups blobs inside folders.',
      ),
  }),
  async execute(input, ctx) {
    const result = await list({
      ...input,
      ...blobCommandOptions(ctx),
    });

    return {
      blobs: result.blobs.map((blob) => ({
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        size: blob.size,
        uploadedAt: blob.uploadedAt.toISOString(),
        etag: blob.etag,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
      folders:
        'folders' in result && result.folders !== undefined
          ? result.folders
          : undefined,
    };
  },
});
